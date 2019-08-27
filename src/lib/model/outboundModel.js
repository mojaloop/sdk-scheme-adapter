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
const MojaloopRequests = require('@mojaloop/sdk-standard-components').MojaloopRequests;
const Ilp = require('@mojaloop/sdk-standard-components').Ilp;
const shared = require('@internal/shared');

const ASYNC_TIMEOUT_MILLS = 30000;

const transferStateEnum = {
    'WAITING_FOR_QUOTE_ACCEPTANCE': 'WAITING_FOR_QUOTE_ACCEPTANCE',
    'ERROR_OCCURED': 'ERROR_OCCURED',
    'COMPLETED': 'COMPLETED'
};


/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class OutboundTransfersModel {
    constructor(config) {
        this.cache = config.cache;
        this.logger = config.logger;
        this.ASYNC_TIMEOUT_MILLS = config.asyncTimeoutMillis || ASYNC_TIMEOUT_MILLS;
        this.dfspId = config.dfspId;
        this.expirySeconds = config.expirySeconds;
        this.autoAcceptQuotes = config.autoAcceptQuotes;

        this.requests = new MojaloopRequests({
            logger: this.logger,
            peerEndpoint: config.peerEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2BearerToken: config.wso2BearerToken
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
                { name: 'resolvePayee', from: 'start', to: 'resolvePayee' },
                { name: 'requestQuote', from: 'resolvePayee', to: 'requestQuote' },
                { name: 'executeTransfer', from: 'requestQuote', to: 'executeTransfer' },
                { name: 'succeeded', from: 'executeTransfer', to: 'succeeded' },
                { name: 'error', from: '*', to: 'errored' },
            ],
            methods: {
                onAfterTransition: this._handleTransition.bind(this),
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
                this.logger.push({ args }).log('State machine in errored state');
                this.data.lastError = args[0] ? args[0].message || 'unknown error' : 'unspecified error';
                break;

            default:
                this.logger.log(`Unhandled state transition for transfer ${this.data.transferId}`);
        }
    }


    /**
     * Resolves the payee.
     * Starts the payee resolution process by sending a GET /parties request to the switch;
     * then waits for a notification from the cache that the payee has been resolved.
     */
    async _resolvePayee() {
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new Error(`Timeout resolving payee for transfer ${this.data.transferId}`);
                this.stateMachine.error(err);
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);

            // listen for resolution events on the payee idType and idValue
            const payeeKey = `${this.data.to.idType}_${this.data.to.idValue}`;

            this.subscriber.subscribe(payeeKey);
            this.subscriber.on('message', (cn, msg) => {
                try {
                    let payee = JSON.parse(msg);

                    if(payee.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new Error(`Got an error response resolving party: ${util.inspect(payee)}`);
                        this.stateMachine.error(err);
                        return reject(err);
                    }

                    if(!payee.party) {
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
                        this.stateMachine.error(err);
                        return reject(err);
                    }

                    if(payee.partyIdInfo.partyIdentifier !== this.data.to.idValue) {
                        const err = new Error(`Expecting resolved payee party identifier to be ${this.data.to.idValue} but got ${payee.partyIdInfo.partyIdentifier}`);
                        this.stateMachine.error(err);
                        return reject(err);
                    }

                    if(!payee.partyIdInfo.fspId) {
                        const err = new Error(`Expecting resolved payee party to have an FSPID: ${util.inspect(payee.partyIdInfo)}`);
                        this.stateMachine.error(err);
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

                    return resolve();
                }
                catch(err) {
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                const res = await this.requests.getParties(this.data.to.idType, this.data.to.idValue);
                this.logger.push({ peer: res }).log('Party lookup sent to peer');
            }
            catch(err) {
                this.stateMachine.error(err);
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
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new Error(`Timeout requesting quote for transfer ${this.data.transferId}`);
                this.stateMachine.error(err);
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);

            // create a quote request
            const quote = this._buildQuoteRequest();

            // listen for events on the quoteId
            const quoteKey = `${quote.quoteId}`;

            this.subscriber.subscribe(quoteKey);
            this.subscriber.on('message', (cn, msg) => {
                try {
                    let message = JSON.parse(msg);

                    if(message.type === 'quoteResponseError') {
                        // this is an error response to our POST /quotes request
                        const err = new Error(`Got an error response requesting quote: ${util.inspect(message)}`);
                        this.stateMachine.error(err);
                        return reject(err);
                    }

                    if(message.type !== 'quoteResponse') {
                        // ignore any message on this subscription that is not a quote response
                        this.logger.push({ message }).log(`Ignoring cache notification for quote ${quoteKey}. Type is not quoteResponse.`);
                        return;
                    }

                    const quoteResponse = message.data;

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    this.logger.push({ quoteResponse }).log('Quote response received');

                    // stop listening for payee resolution messages
                    this.subscriber.unsubscribe(quoteKey, () => {
                        this.logger.log('Quote request subscriber unsubscribed');
                    });

                    this.data.quoteId = quote.quoteId;
                    this.data.quoteResponse = quoteResponse;

                    return resolve(quote);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /quotes request to the switch
            try {
                const res = await this.requests.postQuotes(quote, this.data.to.fspId);
                this.logger.push({ res }).log('Quote request sent to peer');
            }
            catch(err) {
                this.stateMachine.error(err);
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

        return quote;
    }


    /**
     * Executes a transfer
     * Starts the transfer process by sending a POST /transfers (prepare) request to the switch;
     * then waits for a notification from the cache that the transfer has been fulfilled
     */
    async _executeTransfer() {
        return new Promise(async (resolve, reject) => {
            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new Error(`Timeout waiting for fulfil for transfer ${this.data.transferId}`);
                this.stateMachine.error(err);
                return reject(err);
            }, ASYNC_TIMEOUT_MILLS);

            // listen for events on the transferId
            const transferKey = `${this.data.transferId}`;

            this.subscriber.subscribe(transferKey);
            this.subscriber.on('message', async (cn, msg) => {
                try {
                    let message = JSON.parse(msg);

                    if(message.type === 'transferError') {
                        // this is an error response to our POST /transfers request
                        const err = new Error(`Got an error response preparing transfer: ${util.inspect(message)}`);
                        this.stateMachine.error(err);
                        return reject(err);
                    }

                    if(message.type !== 'transferFulfil') {
                        // ignore any message on this subscription that is not a transferFulfil
                        this.logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Type is not transferFulfil.`);
                        return;
                    }

                    const fulfil = message.data;

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    this.logger.push({ fulfil }).log('Transfer fulfil received');

                    // stop listening for payee resolution messages
                    this.subscriber.unsubscribe(transferKey, () => {
                        this.logger.log('Transfer fulfil subscriber unsubscribed');
                    });

                    this.data.fulfil = fulfil;

                    if(this.checkIlp && !this.ilp.validateFulfil(fulfil, this.data.quoteResponse.condition)) {
                        throw new Error('Invalid fulfilment received from peer DFSP.');
                    }

                    return resolve(fulfil);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const prepare = this._buildTransferPrepare();
                const res = await this.requests.postTransfers(prepare, this.data.to.fspId);
                this.logger.push({ res }).log('Transfer prepare sent to peer');
            }
            catch(err) {
                this.stateMachine.error(err);
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
                currency: this.data.currency,
                amount: this.data.amount
            },
            ilpPacket: this.data.quoteResponse.ilpPacket,
            condition: this.data.quoteResponse.condition,
            expiration: this._getExpirationTimestamp() 
        };

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
        // make sure the current stateMachine state is up to date
        this.data.currentState = this.stateMachine.state;

        // we want to project some of our internal state into a more useful
        // representation to return to the SDK API consumer
        let resp = { ...this.data };

        switch(this.data.currentState) {
            case 'requestQuote':
                resp.currentState = transferStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case 'executeTransfer':
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
            await this.initialize(data);
            this.logger.push({ cache: this.data }).log('Transfer model loaded from cached state');
        }
        catch(err) {
            this.logger.push({ err }).log('Error loading transfer model');
            throw err;
        }
    }


    /**
     * Unsubscribes the models subscriber from all subscriptions
     */
    async _unsubscribeAll() {
        return new Promise((resolve) => {
            this.subscriber.unsubscribe(() => {
                this.logger.log('Transfer model unsubscribed from all subscriptions');
                return resolve();
            });
        });
    }


    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            if(this.data.currentState === 'start') {
                // we are at the start of the transfer process so proceed with reslving payee and requesting a quote
                await this.stateMachine.resolvePayee();
                this.logger.log(`Payee resolved for transfer ${this.data.transferId}`);

                await this.stateMachine.requestQuote(); 
                this.logger.log(`Quote received for transfer ${this.data.transferId}`);

                if(!this.autoAcceptQuotes) {
                    // we are configured to require a quote confirmation so return now.
                    // we may be resumed later with a quote confirmation.
                    this.logger.log('Transfer model skipping execution of transfer and will wait for quote confirmation or rejection');
                    await this._save();
                    return this.getResponse();
                }
            }

            //if(this.data.currentState !== 'requestQuote') {
            //    throw new Error(`Unable to continue with transfer ${this.data.transferId} model. Expected to be in requestQuote state but in ${this.data.currentState}`);
            //}

            await this.stateMachine.executeTransfer();
            this.logger.log('Transfer fulfilled');

            this.logger.log(`Transfer model state machine ended in state: ${this.stateMachine.state}`);

            await this._unsubscribeAll();
            return this.getResponse();
        }
        catch(err) {
            this.logger.push({ err }).log('Error running transfer model');
            this.stateMachine.error(err);
            await this._unsubscribeAll();
            err.transferState = this.getResponse();
            throw err;
        }
    }
}


module.exports = OutboundTransfersModel;
