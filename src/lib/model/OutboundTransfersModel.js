/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const util = require('util');
const uuidv4 = require('uuid/v4');
const StateMachine = require('javascript-state-machine');
const { Ilp, MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const shared = require('@internal/shared');
const { BackendError } = require('./common');
const { getSpanTags } = require('@mojaloop/central-services-shared').Util.EventFramework;
const Enum = require('@mojaloop/central-services-shared').Enum;
const Metrics = require('@mojaloop/central-services-metrics');

const ASYNC_TIMEOUT_MILLS = 300000;

const transferStateEnum = {
    'WAITING_FOR_PARTY_ACEPTANCE': 'WAITING_FOR_PARTY_ACCEPTANCE',
    'WAITING_FOR_QUOTE_ACCEPTANCE': 'WAITING_FOR_QUOTE_ACCEPTANCE',
    'ERROR_OCCURED': 'ERROR_OCCURED',
    'COMPLETED': 'COMPLETED',
};


/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class OutboundTransfersModel {
    constructor(config) {
        this.cache = config.cache;
        this.logger = config.logger;
        this.span = config.span;
        this.headers = config.headers;
        this.ASYNC_TIMEOUT_MILLS = config.asyncTimeoutMillis || ASYNC_TIMEOUT_MILLS;
        this.dfspId = config.dfspId;
        this.expirySeconds = config.expirySeconds;
        this.rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;
        this.rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;
        this.autoAcceptQuotes = config.autoAcceptQuotes;
        this.autoAcceptParty = config.autoAcceptParty;
        this.useQuoteSourceFSPAsTransferPayeeFSP = config.useQuoteSourceFSPAsTransferPayeeFSP;
        this.checkIlp = config.checkIlp;

        this._requests = new MojaloopRequests({
            logger: this.logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });

        this.ilp = new Ilp({
            secret: config.ilpSecret
        });
    }


    /**
     * Initializes the internal state machine object
     */
    _initStateMachine (initState) {
        this.stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: 'resolvePayee', from: 'start', to: 'payeeResolved' },
                { name: 'requestQuote', from: 'payeeResolved', to: 'quoteReceived' },
                { name: 'executeTransfer', from: 'quoteReceived', to: 'succeeded' },
                { name: 'error', from: '*', to: 'errored' },
            ],
            methods: {
                onTransition: this._handleTransition.bind(this),
                onAfterTransition: this._afterTransition.bind(this),
                onPendingTransition: (transition, from, to) => {
                    // allow transitions to 'error' state while other transitions are in progress
                    if(transition !== 'error') {
                        throw new Error(`Transition requested while another transition is in progress: ${transition} from: ${from} to: ${to}`);
                    }
                }
            }
        });

        return this.stateMachine[initState];
    }


    /**
     * Updates the internal state representation to reflect that of the state machine itself
     */
    _afterTransition() {
        this.logger.log(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
        this.data.currentState = this.stateMachine.state;
    }


    /**
     * Initializes the transfer model
     *
     * @param data {object} - The inbound API POST /transfers request body
     */
    async initialize(data) {
        this.data = data;

        // add a transferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('transferId')) {
            this.data.transferId = uuidv4();
        }

        // initialize the transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

        this._initStateMachine(this.data.currentState);

        // set up a cache pub/sub subscriber
        this.subscriber = await this.cache.getClient();
    }


    /**
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this.logger.log(`Transfer ${this.data.transferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case 'resolvePayee':
                // resolve the payee
                return this._resolvePayee();

            case 'requestQuote':
                // request a quote
                return this._requestQuote();

            case 'executeTransfer':
                // prepare a transfer and wait for fulfillment
                return this._executeTransfer();

            case 'error':
                this.logger.log(`State machine is erroring with error: ${util.inspect(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for transfer ${this.data.transferId}: ${util.inspect(args)}`);
        }
    }


    /**
     * Resolves the payee.
     * Starts the payee resolution process by sending a GET /parties request to the switch;
     * then waits for a notification from the cache that the payee has been resolved.
     */
    async _resolvePayee() {
        const histTimerEnd = Metrics.getHistogram(
            'outbound_resolve_payee',
            'Get participants details to complete a quote and get a completed transfer synchronously',
            ['success', 'fspId']
        ).startTimer();
        const payeeKey = `${this.data.to.idType}_${this.data.to.idValue}`;
        const resolvePayeeSpan = this.span.getChild('sdk_outbound_resolve_payee');
        resolvePayeeSpan.setTags(getSpanTags(Enum.Events.Event.Type.PARTY, Enum.Events.Event.Action.RESOLVE, payeeKey, this.dfspId, 'parties'));
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout resolving payee for transfer ${this.data.transferId}`, 504);
                histTimerEnd({ success: false });
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);


            this.subscriber.subscribe(payeeKey);
            this.subscriber.on('message', (cn, msg) => {
                try {
                    let payee = JSON.parse(msg);

                    if(payee.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new BackendError(`Got an error response resolving party: ${util.inspect(payee)}`, 500);
                        err.mojaloopError = payee;

                        // cancel the timeout handler
                        clearTimeout(timeout);
                        histTimerEnd({ success: false });
                        resolvePayeeSpan.error(err);
                        resolvePayeeSpan.finish(err);
                        return reject(err);
                    }

                    if(!payee.party) {
                        // we should never get a non-error response without a party, but just in case...
                        // cancel the timeout handler
                        clearTimeout(timeout);
                        histTimerEnd({ success: false });
                        resolvePayeeSpan.error(`Resolved payee has no party object: ${util.inspect(payee)}`);
                        resolvePayeeSpan.finish(`Resolved payee has no party object: ${util.inspect(payee)}`);
                        return reject(new Error(`Resolved payee has no party object: ${util.inspect(payee)}`));
                    }

                    payee = payee.party;

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    this.logger.push({ payee }).log('Payee resolved');

                    // stop listening for payee resolution messages
                    this.subscriber.unsubscribe(payeeKey, () => {
                        this.logger.log('Payee resolution subscriber unsubscribed');
                    });

                    // check we got the right payee and info we need
                    if(payee.partyIdInfo.partyIdType !== this.data.to.idType) {
                        const err = new Error(`Expecting resolved payee party IdType to be ${this.data.to.idType} but got ${payee.partyIdInfo.partyIdType}`);
                        histTimerEnd({ success: false });
                        resolvePayeeSpan.error(err.message);
                        resolvePayeeSpan.finish(err.message);
                        return reject(err);
                    }

                    if(payee.partyIdInfo.partyIdentifier !== this.data.to.idValue) {
                        const err = new Error(`Expecting resolved payee party identifier to be ${this.data.to.idValue} but got ${payee.partyIdInfo.partyIdentifier}`);
                        histTimerEnd({ success: false });
                        resolvePayeeSpan.error(err.message);
                        resolvePayeeSpan.finish(err.message);
                        return reject(err);
                    }

                    if(!payee.partyIdInfo.fspId) {
                        const err = new Error(`Expecting resolved payee party to have an FSPID: ${util.inspect(payee.partyIdInfo)}`);
                        histTimerEnd({ success: false });
                        resolvePayeeSpan.error(err.message);
                        resolvePayeeSpan.finish(err.message);
                        return reject(err);

                    }

                    // now we got the payee, add the details to our data so we can use it
                    // in the quote request
                    this.data.to.fspId = payee.partyIdInfo.fspId;

                    if(payee.personalInfo) {
                        if(payee.personalInfo.complexName) {
                            this.data.to.firstName = payee.personalInfo.complexName.firstName || this.data.to.firstName;
                            this.data.to.middleName = payee.personalInfo.complexName.middleName || this.data.to.middleName;
                            this.data.to.lastName = payee.personalInfo.complexName.lastName || this.data.to.lastName;
                        }
                        this.data.to.dateOfBirth = payee.personalInfo.dateOfBirth;
                    }
                    histTimerEnd({ success: true });
                    resolvePayeeSpan.finish();
                    return resolve();
                }
                catch(err) {
                    histTimerEnd({ success: false });
                    resolvePayeeSpan.error(err);
                    resolvePayeeSpan.finish(err);
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                const res = await this._requests.getParties(this.data.to.idType, this.data.to.idValue, resolvePayeeSpan);
                this.logger.push({ peer: res }).log('Party lookup sent to peer');
                histTimerEnd({ success: true });
            }
            catch(err) {
                histTimerEnd({ success: false });
                await resolvePayeeSpan.error(err);
                await resolvePayeeSpan.finish(err);
                return reject(err);
            }
        });
    }


    /**
     * Requests a quote
     * Starts the quote resolution process by sending a POST /quotes request to the switch;
     * then waits for a notification from the cache that the quote response has been received
     */
    async _requestQuote() {
        const histTimerEnd = Metrics.getHistogram(
            'outbound_request_quote',
            'Execute a quote built from the payee information',
            ['success', 'fspId']
        ).startTimer();
        const requestQuoteSpan = this.span.getChild('sdk_outbound_request_quote');
        const quote = this._buildQuoteRequest();
        requestQuoteSpan.setTags(getSpanTags(Enum.Events.Event.Type.QUOTE, Enum.Events.Event.Action.REQUEST, quote.quoteId, this.dfspId, this.data.to.fspId));
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout requesting quote for transfer ${this.data.transferId}`, 504);
                histTimerEnd({ success: false });
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);

            // create a quote request
            // listen for events on the quoteId
            const quoteKey = `${quote.quoteId}`;

            this.subscriber.subscribe(quoteKey);
            this.subscriber.on('message', (cn, msg) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'quoteResponse') {
                        if (this.rejectExpiredQuoteResponses) {
                            const now = new Date().toISOString();
                            if (now > quote.expiration) {
                                const msg = 'Quote response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this.logger.error(`${msg}: system time=${now} > expiration time=${quote.expiration}`);
                            }
                        }
                    } else if (message.type === 'quoteResponseError') {
                        error = new BackendError(`Got an error response requesting quote: ${util.inspect(message.data)}`, 500);
                        error.mojaloopError = message.data;
                    }
                    else {
                        this.logger.push({ message }).log(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
                        histTimerEnd({ success: false });
                        requestQuoteSpan.error(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
                        requestQuoteSpan.finish(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for payee resolution messages
                    this.subscriber.unsubscribe(quoteKey, () => {
                        this.logger.log('Quote request subscriber unsubscribed');
                    });

                    if (error) {
                        histTimerEnd({ success: false });
                        requestQuoteSpan.error(error);
                        requestQuoteSpan.finish(error);
                        return reject(error);
                    }

                    const quoteResponseBody = message.data;
                    const quoteResponseHeaders = message.headers;
                    this.logger.push({ quoteResponseBody }).log('Quote response received');
                    this.data.quoteId = quote.quoteId;
                    this.data.quoteResponse = quoteResponseBody;
                    this.data.quoteResponseSource = quoteResponseHeaders['fspiop-source'];
                    histTimerEnd({ success: true });
                    requestQuoteSpan.finish();
                    return resolve(quote);
                }
                catch(err) {
                    requestQuoteSpan.error(err);
                    requestQuoteSpan.finish(err);
                    histTimerEnd({ success: false });
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /quotes request to the switch
            try {
                const res = await this._requests.postQuotes(quote, this.data.to.fspId, requestQuoteSpan);
                this.logger.push({ res }).log('Quote request sent to peer');
                histTimerEnd({ success: true });
            }
            catch(err) {
                histTimerEnd({ success: false });
                await requestQuoteSpan.error(err);
                await requestQuoteSpan.finish(err);
                return reject(err);
            }
        });
    }


    /**
     * Constructs a quote request payload based on current state
     *
     * @returns {object} - the quote request object
     */
    _buildQuoteRequest() {
        let quote = {
            quoteId: uuidv4(),
            transactionId: this.data.transferId,
            amountType: this.data.amountType,
            amount: {
                currency: this.data.currency,
                amount: this.data.amount
            },
            expiration: this._getExpirationTimestamp()
        };

        quote.payer = shared.internalPartyToMojaloopParty(this.data.from, this.dfspId);
        quote.payee = shared.internalPartyToMojaloopParty(this.data.to, this.data.to.fspId);

        quote.transactionType = {
            scenario: this.data.transactionType,
            // TODO: support payee initiated txns?
            initiator: 'PAYER',
            // TODO: defaulting to CONSUMER initiator type should
            // be replaced with a required element on the incoming
            // API request
            initiatorType: this.data.from.type || 'CONSUMER'
        };

        // geocode
        // note
        if(this.data.note) {
            quote.note = this.data.note;
        }

        // add extensionList if provided
        if(this.data.quoteRequestExtensions && this.data.quoteRequestExtensions.length > 0) {
            quote.extensionList = {
                extension: this.data.quoteRequestExtensions
            };
        }

        return quote;
    }


    /**
     * Executes a transfer
     * Starts the transfer process by sending a POST /transfers (prepare) request to the switch;
     * then waits for a notification from the cache that the transfer has been fulfilled
     */
    async _executeTransfer() {
        const histTimerEnd = Metrics.getHistogram(
            'outbound_execute_transfers',
            'Execute a transfer built from the quote and payee information',
            ['success', 'fspId']
        ).startTimer();
        const executeTransferSpan = this.span.getChild('sdk_outbound_execute_transfers');
        const prepare = this._buildTransferPrepare();
        executeTransferSpan.setTags(getSpanTags(Enum.Events.Event.Type.TRANSFER, Enum.Events.Event.Action.INITIATE, prepare.transferId, this.dfspId, this.data.quoteResponseSource));
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for fulfil for transfer ${this.data.transferId}`, 504);
                histTimerEnd({ success: false });
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);

            // listen for events on the transferId
            const transferKey = `${this.data.transferId}`;

            this.subscriber.subscribe(transferKey);
            this.subscriber.on('message', async (cn, msg) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transferFulfil') {
                        if (this.rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > prepare.expiration) {
                                const msg = 'Transfer fulfil missed expiry deadline';
                                this.logger.error(`${msg}: system time=${now} > expiration=${prepare.expiration}`);
                                error = new BackendError(msg, 504);
                            }
                        }
                    } else if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response preparing transfer: ${util.inspect(message.data)}`, 500);
                        error.mojaloopError = message.data;
                    } else {
                        this.logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        histTimerEnd({ success: false });
                        await executeTransferSpan.error(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        await executeTransferSpan.finish(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for payee resolution messages
                    this.subscriber.unsubscribe(transferKey, () => {
                        this.logger.log('Transfer fulfil subscriber unsubscribed');
                    });

                    if (error) {
                        histTimerEnd({ success: false });
                        await executeTransferSpan.error(error);
                        await executeTransferSpan.finish(error);
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this.logger.push({ fulfil }).log('Transfer fulfil received');
                    this.data.fulfil = fulfil;

                    if(this.checkIlp && !this.ilp.validateFulfil(fulfil.fulfilment, this.data.quoteResponse.condition)) {
                        histTimerEnd({ success: false });
                        throw new Error('Invalid fulfilment received from peer DFSP.');
                    }
                    histTimerEnd({ success: true });
                    await executeTransferSpan.finish();
                    return resolve(fulfil);
                }
                catch(err) {
                    histTimerEnd({ success: false });
                    await executeTransferSpan.error(err);
                    await executeTransferSpan.finish(err);
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource, executeTransferSpan);
                this.logger.push({ res }).log('Transfer prepare sent to peer');
                histTimerEnd({ success: true });
            }
            catch(err) {
                histTimerEnd({ success: false });
                await executeTransferSpan.error(err);
                await executeTransferSpan.finish(err);
                return reject(err);
            }
        });
    }


    /**
     * Builds a transfer prepare payload from current state
     *
     * @returns {object} - the transfer prepare payload
     */
    _buildTransferPrepare() {
        let prepare = {
            transferId: this.data.transferId,
            payeeFsp: this.data.to.fspId,
            payerFsp: this.dfspId,
            amount: {
                // We use the transfer currency and amount specified in the quote response
                // rather than the original request. In Forex cases we may have requested
                // a RECEIVE amount in a currency we cannot send. FXP should always give us
                // a quote response with transferAmount in the correct currency.
                currency: this.data.quoteResponse.transferAmount.currency,
                amount: this.data.quoteResponse.transferAmount.amount
            },
            ilpPacket: this.data.quoteResponse.ilpPacket,
            condition: this.data.quoteResponse.condition,
            expiration: this._getExpirationTimestamp()
        };

        if(this.useQuoteSourceFSPAsTransferPayeeFSP) {
            prepare.payeeFsp = this.data.quoteResponseSource;
        }

        // add extensions list if provided
        if(this.data.transferRequestExtensions && this.data.transferRequestExtensions.length > 0) {
            prepare.extensionList = {
                extension: this.data.transferRequestExtensions
            };
        }

        return prepare;
    }


    /**
     * Returns an ISO-8601 format timestamp n-seconds in the future for expiration of a transfers API object,
     * where n is equal to our config setting "expirySeconds"
     *
     * @returns {string} - ISO-8601 format future expiration timestamp
     */
    _getExpirationTimestamp() {
        let now = new Date();
        return new Date(now.getTime() + (this.expirySeconds * 1000)).toISOString();
    }


    /**
     * Returns an object representing the final state of the transfer suitable for the outbound API
     *
     * @returns {object} - Response representing the result of the transfer process
     */
    getResponse() {
        // we want to project some of our internal state into a more useful
        // representation to return to the SDK API consumer
        let resp = { ...this.data };

        switch(this.data.currentState) {
            case 'payeeResolved':
                resp.currentState = transferStateEnum.WAITING_FOR_PARTY_ACEPTANCE;
                break;

            case 'quoteReceived':
                resp.currentState = transferStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = transferStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = transferStateEnum.ERROR_OCCURED;
                break;

            default:
                this.logger.log(`Transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURED state`);
                resp.currentState = transferStateEnum.ERROR_OCCURED;
                break;
        }

        return resp;
    }


    /**
     * Persists the model state to cache for reinstantiation at a later point
     */
    async _save() {
        try {
            this.data.currentState = this.stateMachine.state;
            const res = await this.cache.set(`transferModel_${this.data.transferId}`, this.data);
            this.logger.push({ res }).log('Persisted transfer model in cache');
        }
        catch(err) {
            this.logger.push({ err }).log('Error saving transfer model');
            throw err;
        }
    }


    /**
     * Loads a transfer model from cache for resumption of the transfer process
     *
     * @param transferId {string} - UUID transferId of the model to load from cache
     */
    async load(transferId) {
        try {
            const data = await this.cache.get(`transferModel_${transferId}`);
            if(!data) {
                throw new Error(`No cached data found for transferId: ${transferId}`);
            }
            await this.initialize(data);
            this.logger.push({ cache: this.data }).log('Transfer model loaded from cached state');
        }
        catch(err) {
            this.logger.push({ err }).log('Error loading transfer model');
            throw err;
        }
    }


    /**
     * Unsubscribe the models subscriber from all subscriptions
     */
    async _unsubscribeAll() {
        return new Promise((resolve) => {
            this.subscriber.unsubscribe(() => {
                this.subscriber.quit(() => {
                    this.logger.log('Transfer model unsubscribed from all subscriptions');
                    return resolve();
                });
            });
        });
    }


    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    // next transition is to resolvePayee
                    await this.stateMachine.resolvePayee();
                    this.logger.log(`Payee resolved for transfer ${this.data.transferId}`);
                    if(this.stateMachine.state === 'payeeResolved' && !this.autoAcceptParty) {
                        //we break execution here and return the resolved party details to allow asynchronous accept or reject
                        //of the resolved party
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'payeeResolved':
                    // next transition is to requestQuote
                    await this.stateMachine.requestQuote();
                    this.logger.log(`Quote received for transfer ${this.data.transferId}`);
                    if(this.stateMachine.state === 'quoteReceived' && !this.autoAcceptQuotes) {
                        //we break execution here and return the quote response details to allow asynchronous accept or reject
                        //of the quote
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'quoteReceived':
                    // next transition is executeTransfer
                    await this.stateMachine.executeTransfer();
                    this.logger.log(`Transfer ${this.data.transferId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this.logger.log('Transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this.logger.log('State machine in errored state');
                    return;
            }

            // now call ourslves recursively to deal with the next transition
            this.logger.log(`Transfer model state machine transition completed in state: ${this.stateMachine.state}. Recusring to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this.logger.log(`Error running transfer model: ${util.inspect(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                await this._unsubscribeAll();

                // err should not have a transferState property here!
                if(err.transferState) {
                    this.logger.log(`State machine is broken: ${util.inspect(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between transferState.lastError and err
                err.transferState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }
}


module.exports = OutboundTransfersModel;
