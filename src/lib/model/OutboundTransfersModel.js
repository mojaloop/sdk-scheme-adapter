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
const { uuid } = require('uuidv4');
const StateMachine = require('javascript-state-machine');
const { Ilp, MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const shared = require('./lib/shared');
const { BackendError, TransferStateEnum } = require('./common');
const PartiesModel = require('./PartiesModel');

/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class OutboundTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;
        this._rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;
        this._autoAcceptQuotes = config.autoAcceptQuotes;
        this._autoAcceptParty = config.autoAcceptParty;
        this._useQuoteSourceFSPAsTransferPayeeFSP = config.useQuoteSourceFSPAsTransferPayeeFSP;
        this._checkIlp = config.checkIlp;
        this._multiplePartiesResponse = config.multiplePartiesResponse;
        this._multiplePartiesResponseSeconds = config.multiplePartiesResponseSeconds;
        this._sendFinalNotificationIfRequested = config.sendFinalNotificationIfRequested;

        if (this._autoAcceptParty && this._multiplePartiesResponse) {
            throw new Error('Conflicting config options provided: autoAcceptParty and multiplePartiesResponse');
        }

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            transactionRequestsEndpoint: config.transactionRequestsEndpoint,
            dfspId: config.dfspId,
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            wso2: config.wso2,
            resourceVersions: config.resourceVersions,
        });

        this._ilp = new Ilp({
            secret: config.ilpSecret,
            logger: this._logger,
        });

        this.metrics = {
            partyLookupRequests: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_party_lookup_request_count',
                'Count of outbound party lookup requests sent'),
            partyLookupResponses: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_party_lookup_response_count',
                'Count of responses received to outbound party lookups'),
            quoteRequests: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_quote_request_count',
                'Count of outbound quote requests sent'),
            quoteResponses: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_quote_response_count',
                'Count of responses received to outbound quote requests'),
            transferPrepares: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_transfer_prepare_count',
                'Count of outbound transfer prepare requests sent'),
            transferFulfils: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_transfer_fulfil_response_count',
                'Count of responses received to outbound transfer prepares'),
            partyLookupLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_party_lookup_latency',
                'Time taken for a response to a party lookup request to be received'),
            quoteRequestLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_quote_request_latency',
                'Time taken for a response to a quote request to be received'),
            transferLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_transfer_latency',
                'Time taken for a response to a transfer prepare to be received')
        };
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
                { name: 'requestQuote', from: 'start', to: 'quoteReceived' },
                { name: 'executeTransfer', from: 'quoteReceived', to: 'succeeded' },
                { name: 'getTransfer', to: 'succeeded' },
                { name: 'error', from: '*', to: 'errored' },
                { name: 'abort', from: '*', to: 'aborted' },
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
        this._logger.log(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
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
            this.data.transferId = uuid();
        }

        // initialize the transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

        if(!this.data.hasOwnProperty('initiatedTimestamp')) {
            this.data.initiatedTimestamp = new Date().toISOString();
        }

        if(!this.data.hasOwnProperty('direction')) {
            this.data.direction = 'OUTBOUND';
        }
        if(this.data.skipPartyLookup && !this.data.to.fspId) {
            throw new Error('fspId of to party must be specific id when skipPartyLookup is truthy');
        }

        this._initStateMachine(this.data.currentState);
    }


    /**
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.log(`Transfer ${this.data.transferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case 'resolvePayee':
                // resolve the payee
                if (this._multiplePartiesResponse) {
                    return this._resolveBatchPayees();
                }
                return this._resolvePayee();

            case 'requestQuote':
                // request a quote
                return this._requestQuote();

            case 'getTransfer':
                return this._getTransfer();

            case 'executeTransfer':
                // prepare a transfer and wait for fulfillment
                return this._executeTransfer();

            case 'abort':
                this._logger.log('State machine is aborting transfer');
                this.data.abortedReason = args[0];
                break;

            case 'error':
                this._logger.log(`State machine is erroring with error: ${util.inspect(args)}`);
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
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // listen for resolution events on the payee idType and idValue
            const payeeKey = PartiesModel.channelName({
                type: this.data.to.idType,
                id: this.data.to.idValue,
                subId: this.data.to.idSubValue
            });

            let latencyTimerDone;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(payeeKey, (cn, msg, subId) => {
                try {
                    if(latencyTimerDone) {
                        latencyTimerDone();
                    }
                    this.metrics.partyLookupResponses.inc();

                    this.data.getPartiesResponse = JSON.parse(msg);
                    if(this.data.getPartiesResponse.body && this.data.getPartiesResponse.body.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new BackendError(`Got an error response resolving party: ${util.inspect(this.data.getPartiesResponse.body, { depth: Infinity })}`, 500);
                        err.mojaloopError = this.data.getPartiesResponse.body;
                        // cancel the timeout handler
                        clearTimeout(timeout);
                        return reject(err);
                    }
                    let payee = this.data.getPartiesResponse.body;

                    if(!payee.party) {
                        // we should never get a non-error response without a party, but just in case...
                        // cancel the timeout handler
                        clearTimeout(timeout);
                        return reject(new Error(`Resolved payee has no party object: ${util.inspect(payee)}`));
                    }

                    payee = payee.party;

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    this._logger.push({ payee }).log('Payee resolved');

                    // stop listening for payee resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(payeeKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${payeeKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    // check we got the right payee and info we need
                    if(payee.partyIdInfo.partyIdType !== this.data.to.idType) {
                        const err = new Error(`Expecting resolved payee party IdType to be ${this.data.to.idType} but got ${payee.partyIdInfo.partyIdType}`);
                        return reject(err);
                    }

                    if(payee.partyIdInfo.partyIdentifier !== this.data.to.idValue) {
                        const err = new Error(`Expecting resolved payee party identifier to be ${this.data.to.idValue} but got ${payee.partyIdInfo.partyIdentifier}`);
                        return reject(err);
                    }

                    if(payee.partyIdInfo.partySubIdOrType !== this.data.to.idSubValue) {
                        const err = new Error(`Expecting resolved payee party subTypeId to be ${this.data.to.idSubValue} but got ${payee.partyIdInfo.partySubIdOrType}`);
                        return reject(err);
                    }

                    if(!payee.partyIdInfo.fspId) {
                        const err = new Error(`Expecting resolved payee party to have an FSPID: ${util.inspect(payee.partyIdInfo)}`);
                        return reject(err);
                    }

                    // now we got the payee, add the details to our data so we can use it
                    // in the quote request
                    this.data.to.fspId = payee.partyIdInfo.fspId;
                    if(payee.partyIdInfo.extensionList) {
                        this.data.to.extensionList  = payee.partyIdInfo.extensionList.extension;
                    }
                    if(payee.personalInfo) {
                        if(payee.personalInfo.complexName) {
                            this.data.to.firstName = payee.personalInfo.complexName.firstName || this.data.to.firstName;
                            this.data.to.middleName = payee.personalInfo.complexName.middleName || this.data.to.middleName;
                            this.data.to.lastName = payee.personalInfo.complexName.lastName || this.data.to.lastName;
                        }
                        this.data.to.dateOfBirth = payee.personalInfo.dateOfBirth;
                    }

                    return resolve(payee);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout resolving payee for transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(payeeKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${payeeKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                if(latencyTimerDone) {
                    latencyTimerDone();
                }

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                latencyTimerDone = this.metrics.partyLookupLatency.startTimer();
                const res = await this._requests.getParties(this.data.to.idType, this.data.to.idValue,
                    this.data.to.idSubValue, this.data.to.fspId);

                this.data.getPartiesRequest = res.originalRequest;

                this.metrics.partyLookupRequests.inc();
                this._logger.push({ peer: res }).log('Party lookup sent to peer');
            }
            catch(err) {
                // cancel the timeout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(payeeKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${payeeKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Resolves multiple payees.
     * Starts the payee resolution process by sending a GET /parties request to the switch;
     * then waits for a specified number of seconds and resolve payees with responses from the cache.
     */
    _resolveBatchPayees() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            let latencyTimerDone;
            // hook up a timer to handle response messages
            // const timer = setTimeout((cn, msg, subId) => {
            const payeeResolver = (msg) => {
                this.data.getPartiesResponse = JSON.parse(msg);

                if(this.data.getPartiesResponse.body.errorInformation) {
                    // this is an error response to our GET /parties request
                    const err = new BackendError(`Got an error response resolving party: ${util.inspect(this.data.getPartiesResponse.body, { depth: Infinity })}`, 500);
                    err.mojaloopError = this.data.getPartiesResponse.body;
                    throw err;
                }
                let payee = this.data.getPartiesResponse.body;

                if(!payee.party) {
                    // we should never get a non-error response without a party, but just in case...
                    // cancel the timeout handler
                    throw new Error(`Resolved payee has no party object: ${util.inspect(payee)}`);
                }
                payee = payee.party;
                // check we got the right payee and info we need
                if(payee.partyIdInfo.partyIdType !== this.data.to.idType) {
                    throw new Error(`Expecting resolved payee party IdType to be ${this.data.to.idType} but got ${payee.partyIdInfo.partyIdType}`);
                }
                if(payee.partyIdInfo.partyIdentifier !== this.data.to.idValue) {
                    throw new Error(`Expecting resolved payee party identifier to be ${this.data.to.idValue} but got ${payee.partyIdInfo.partyIdentifier}`);
                }
                if(payee.partyIdInfo.partySubIdOrType !== this.data.to.idSubValue) {
                    throw new Error(`Expecting resolved payee party subTypeId to be ${this.data.to.idSubValue} but got ${payee.partyIdInfo.partySubIdOrType}`);
                }
                if(!payee.partyIdInfo.fspId) {
                    throw new Error(`Expecting resolved payee party to have an FSPID: ${util.inspect(payee.partyIdInfo)}`);
                }
                // now we got the payee, add the details to our data so we can use it
                // in the quote request
                const to = {};
                to.fspId = payee.partyIdInfo.fspId;
                if(payee.partyIdInfo.extensionList) {
                    to.extensionList  = payee.partyIdInfo.extensionList.extension;
                }
                if(payee.personalInfo) {
                    if(payee.personalInfo.complexName) {
                        to.firstName = payee.personalInfo.complexName.firstName || this.data.to.firstName;
                        to.middleName = payee.personalInfo.complexName.middleName || this.data.to.middleName;
                        to.lastName = payee.personalInfo.complexName.lastName || this.data.to.lastName;
                    }
                    to.dateOfBirth = payee.personalInfo.dateOfBirth;
                }
                return to;
            };
            // listen for resolution events on the payee idType and idValue
            // const payeeKey = `${this.data.to.idType}_${this.data.to.idValue}`
            //     + (this.data.to.idSubValue ? `_${this.data.to.idSubValue}` : '');
            const payeeKey = PartiesModel.channelName({
                type: this.data.to.idType,
                id: this.data.to.idValue,
                subId: this.data.to.idSubValue
            });
            const timer = setTimeout(async () => {
                if(latencyTimerDone) {
                    latencyTimerDone();
                }
                this.metrics.partyLookupResponses.inc();
                let payeeList;
                try {
                    payeeList = await this._cache.members(payeeKey);
                } catch (e) {
                    return reject(e);
                }
                if (!payeeList.length) {
                    return reject(new BackendError(`Timeout resolving payees for transfer ${this.data.transferId}`, 504));
                }
                this._logger.push({ payeeList }).log('Payees resolved');
                this.data.to = payeeList.map(payeeResolver);
                resolve();
            }, this._multiplePartiesResponseSeconds * 1000);
            // now we have a timeout handler we can fire off
            // a GET /parties request to the switch
            try {
                latencyTimerDone = this.metrics.partyLookupLatency.startTimer();
                const res = await this._requests.getParties(this.data.to.idType, this.data.to.idValue,
                    this.data.to.idSubValue);
                this.data.getPartiesRequest = res.originalRequest;
                this.metrics.partyLookupRequests.inc();
                this._logger.push({ peer: res }).log('Party lookup sent to peer');
            }
            catch(err) {
                // cancel the timer before rejecting the promise
                clearTimeout(timer);
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
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a quote request
            const quote = this._buildQuoteRequest();
            this.data.quoteId = quote.quoteId;

            // listen for events on the quoteId
            const quoteKey = `qt_${quote.quoteId}`;
            let latencyTimerDone;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(quoteKey, (cn, msg, subId) => {
                try {
                    if(latencyTimerDone) {
                        latencyTimerDone();
                    }
                    this.metrics.quoteResponses.inc();

                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'quoteResponse') {
                        if (this._rejectExpiredQuoteResponses) {
                            const now = new Date().toISOString();
                            if (now > quote.expiration) {
                                const msg = 'Quote response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.error(`${msg}: system time=${now} > expiration time=${quote.expiration}`);
                            }
                        }
                    } else if (message.type === 'quoteResponseError') {
                        error = new BackendError(`Got an error response requesting quote: ${util.inspect(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    }
                    else {
                        this._logger.push({ message }).log(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for payee resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(quoteKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${quoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    this.data.quoteResponse = {
                        headers: message.data.headers,
                        body: message.data.body
                    };
                    this._logger.push({ quoteResponse: this.data.quoteResponse.body }).log('Quote response received');

                    this.data.quoteResponseSource = this.data.quoteResponse.headers['fspiop-source'];

                    return resolve(quote);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout requesting quote for transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(quoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${quoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                if(latencyTimerDone) {
                    latencyTimerDone();
                }

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /quotes request to the switch
            try {
                latencyTimerDone = this.metrics.quoteRequestLatency.startTimer();
                const res = await this._requests.postQuotes(quote, this.data.to.fspId);

                this.data.quoteRequest = res.originalRequest;

                this.metrics.quoteRequests.inc();
                this._logger.push({ res }).log('Quote request sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(quoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${quoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

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
            quoteId: uuid(),
            transactionId: this.data.transferId,
            amountType: this.data.amountType,
            amount: {
                currency: this.data.currency,
                amount: this.data.amount
            },
            expiration: this._getExpirationTimestamp()
        };

        quote.payer = shared.internalPartyToMojaloopParty(this.data.from, this._dfspId);
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
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a transfer prepare request
            const prepare = this._buildTransferPrepare();

            // listen for events on the transferId
            const transferKey = `tf_${this.data.transferId}`;

            let latencyTimerDone;

            const subId = await this._cache.subscribe(transferKey, async (cn, msg, subId) => {
                try {
                    if(latencyTimerDone) {
                        latencyTimerDone();
                    }

                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transferFulfil') {
                        this.metrics.transferFulfils.inc();

                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > prepare.expiration) {
                                const msg = 'Transfer fulfil missed expiry deadline';
                                this._logger.error(`${msg}: system time=${now} > expiration=${prepare.expiration}`);
                                error = new BackendError(msg, 504);
                            }
                        }
                    } else if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response preparing transfer: ${util.inspect(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    } else {
                        this._logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this._logger.push({ fulfil: fulfil.body }).log('Transfer fulfil received');
                    this.data.fulfil = fulfil;
                    if(this._checkIlp && !this._ilp.validateFulfil(fulfil.body.fulfilment, this.data.quoteResponse.body.condition)) {
                        throw new Error('Invalid fulfilment received from peer DFSP.');
                    }
                    if(this._sendFinalNotificationIfRequested && fulfil.body.transferState === 'RESERVED') {
                        // we need to send a PATCH notification back to say we have committed the transfer.
                        // Note that this is normally a switch only responsibility but the capability is
                        // implemented here to support testing use cases where the mojaloop-connector is
                        // acting in a peer-to-peer scenario and it is desirable for the other peer to
                        // receive this notification.
                        // Note that the transfer is considered committed as far as this (payer) side is concerned
                        // we will use the current server time as committed timestamp.
                        const patchNotification = {
                            completedTimestamp: (new Date()).toISOString(),
                            transferState: 'COMMITTED',
                        };
                        const res = this._requests.patchTransfers(this.data.transferId,
                            patchNotification, this.data.quoteResponseSource);
                        this.data.patch = res.originalRequest;
                        this._logger.log(`PATCH final notification sent to peer for transfer ${this.data.transferId}`);
                    }
                    return resolve(fulfil.body);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for fulfil for transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                if(latencyTimerDone) {
                    latencyTimerDone();
                }

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                latencyTimerDone = this.metrics.transferLatency.startTimer();
                const res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource);

                this.data.prepare = res.originalRequest;

                this.metrics.transferPrepares.inc();
                this._logger.push({ res }).log('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timeout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Get transfer details by sending GET /transfers request to the switch
     */
    async _getTransfer() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const transferKey = `tf_${this.data.transferId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(transferKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);
                    if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response retrieving transfer: ${util.inspect(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    } else if (message.type !== 'transferFulfil') {
                        this._logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }
                    // cancel the timeout handler
                    clearTimeout(timeout);
                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });
                    if (error) {
                        return reject(error);
                    }
                    const fulfil = message.data;
                    this._logger.push({ fulfil: fulfil.body }).log('Transfer fulfil received');
                    this.data.fulfil = fulfil;
                    return resolve(this.data.fulfil);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout getting transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /transfers request to the switch
            try {
                const res = await this._requests.getTransfers(this.data.transferId);
                this._logger.push({ peer: res }).log('Transfer lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

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
            payerFsp: this._dfspId,
            amount: {
                // We use the transfer currency and amount specified in the quote response
                // rather than the original request. In Forex cases we may have requested
                // a RECEIVE amount in a currency we cannot send. FXP should always give us
                // a quote response with transferAmount in the correct currency.
                currency: this.data.quoteResponse.body.transferAmount.currency,
                amount: this.data.quoteResponse.body.transferAmount.amount
            },
            ilpPacket: this.data.quoteResponse.body.ilpPacket,
            condition: this.data.quoteResponse.body.condition,
            expiration: this._getExpirationTimestamp()
        };

        if(this._useQuoteSourceFSPAsTransferPayeeFSP) {
            prepare.payeeFsp = this.data.quoteResponseSource;
        }

        // add extensions list if provided
        const { transferRequestExtensions } = this.data;
        if(transferRequestExtensions && transferRequestExtensions.length > 0) {
            prepare.extensionList = {
                extension: transferRequestExtensions,
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
        return new Date(now.getTime() + (this._expirySeconds * 1000)).toISOString();
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
                resp.currentState = TransferStateEnum.WAITING_FOR_PARTY_ACCEPTANCE;
                break;

            case 'quoteReceived':
                resp.currentState = TransferStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = TransferStateEnum.COMPLETED;
                break;

            case 'aborted':
                resp.currentState = TransferStateEnum.ABORTED;
                break;

            case 'errored':
                resp.currentState = TransferStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.log(`Transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
                resp.currentState = TransferStateEnum.ERROR_OCCURRED;
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
            const res = await this._cache.set(`transferModel_out_${this.data.transferId}`, this.data);
            this._logger.push({ res }).log('Persisted transfer model in cache');
        }
        catch(err) {
            this._logger.push({ err }).log('Error saving transfer model');
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
            const data = await this._cache.get(`transferModel_out_${transferId}`);

            if(!data) {
                throw new Error(`No cached data found for transferId: ${transferId}`);
            }
            await this.initialize(data);
            this._logger.push({ cache: this.data }).log('Transfer model loaded from cached state');
        }
        catch(err) {
            this._logger.push({ err }).log('Error loading transfer model');
            throw err;
        }
    }


    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     *
     * @param mergeDate {object} - an object to merge with the model state (data) before running the state machine
     */
    async run(mergeData) {
        try {
            // if we were passed a mergeData object...
            // merge it with our existing state, overwriting any existing matching root level keys
            if(mergeData) {
                // first remove any merge keys that we do not want to allow to be changed
                // note that we could do this in the swagger also. this is to put a responsibility
                // on this model to defend itself.
                const permittedMergeKeys = ['acceptParty', 'acceptQuote', 'amount', 'to'];
                Object.keys(mergeData).forEach(k => {
                    if(permittedMergeKeys.indexOf(k) === -1) {
                        delete mergeData[k];
                    }
                });
                this.data = {
                    ...this.data,
                    ...mergeData,
                };
            }
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    // first transition is to resolvePayee
                    if(typeof(this.data.to.fspId) !== 'undefined' && this.data.skipPartyLookup) {
                        // we already have the payee DFSP and we have bee asked to skip party resolution
                        this._logger.log(`Skipping payee resolution for transfer ${this.data.transferId} as to.fspId was provided and skipPartyLookup is truthy`);
                        this.data.currentState = 'payeeResolved';
                        break;
                    }

                    // next transition is to resolvePayee
                    await this.stateMachine.resolvePayee();
                    this._logger.log(`Payee resolved for transfer ${this.data.transferId}`);
                    if(this.stateMachine.state === 'payeeResolved' && !this._autoAcceptParty) {
                        //we break execution here and return the resolved party details to allow asynchronous accept or reject
                        //of the resolved party
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'payeeResolved':
                    if(!this._autoAcceptParty && !this.data.acceptParty && !this.data.skipPartyLookup) {
                        // resuming after a party resolution halt, backend did not accept the party.
                        await this.stateMachine.abort('Payee rejected by backend');
                        await this._save();
                        return this.getResponse();
                    }

                    // next transition is to requestQuote
                    await this.stateMachine.requestQuote();
                    this._logger.log(`Quote received for transfer ${this.data.transferId}`);
                    if(this.stateMachine.state === 'quoteReceived' && !this._autoAcceptQuotes) {
                        //we break execution here and return the quote response details to allow asynchronous accept or reject
                        //of the quote
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'quoteReceived':
                    if(!this._autoAcceptQuotes && !this.data.acceptQuote) {
                        // resuming after a party resolution halt, backend did not accept the party.
                        await this.stateMachine.abort('Quote rejected by backend');
                        await this._save();
                        return this.getResponse();
                    }

                    // next transition is executeTransfer
                    await this.stateMachine.executeTransfer();
                    this._logger.log(`Transfer ${this.data.transferId} has been completed`);
                    break;

                case 'getTransfer':
                    await this.stateMachine.getTransfer();
                    this._logger.log(`Get transfer ${this.data.transferId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.log('Transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    await this._save();
                    this._logger.log('State machine in errored state');
                    return;

                case 'aborted':
                    // stopped in aborted state
                    await this._save();
                    this._logger.log('State machine in aborted state');
                    return this.getResponse();

                default:
                    // The state is not handled here, throwing an error to avoid an infinite recursion of this function
                    await this._save();
                    this._logger.error(`State machine in unhandled(${this.data.currentState}) state`);
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            this._logger.log(`Transfer model state machine transition completed in state: ${this.stateMachine.state}. Recusring to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this._logger.log(`Error running transfer model: ${util.inspect(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a transferState property here!
                if(err.transferState) {
                    this._logger.log(`State machine is broken: ${util.inspect(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between transferState.lastError and err
                err.transferState = JSON.parse(JSON.stringify(this.getResponse()));
                await this._save();
            }
            throw err;
        }
    }
}


module.exports = OutboundTransfersModel;
