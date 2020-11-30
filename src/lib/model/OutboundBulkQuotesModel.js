/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Steven Oderayi - steven.oderayi@modusbox.com                     *
 **************************************************************************/

'use strict';

const util = require('util');
const { uuid } = require('uuidv4');
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const shared = require('@internal/shared');
const { BackendError } = require('./common');

const stateEnum = {
    'ERROR_OCCURRED': 'ERROR_OCCURRED',
    'COMPLETED': 'COMPLETED',
};


/**
 *  Models the state machine and operations required for performing an outbound bulk quote request
 */
class OutboundBulkQuotesModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            bulkQuotesEndpoint: config.bulkQuotesEndpoint,
            dfspId: config.dfspId,
            tls: config.outbound.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2: config.wso2,
        });
    }

    /**
     * Initializes the internal state machine object
     */
    _initStateMachine (initState) {
        this.stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: 'requestBulkQuote', from: 'start', to: 'succeeded' },
                { name: 'getBulkQuote', to: 'succeeded' },
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
        this._logger.log(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
        this.data.currentState = this.stateMachine.state;
    }

    /**
     * Initializes the bulk quotes model
     *
     * @param data {object} - The inbound API POST /bulkQuotes request body
     */
    async initialize(data) {
        this.data = data;

        // add a bulkQuoteId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('bulkQuoteId')) {
            this.data.bulkQuoteId = uuid();
        }

        // initialize the state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

        this._initStateMachine(this.data.currentState);
    }

    /**
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.log(`Bulk quote ${this.data.bulkQuoteId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                return;

            case 'requestBulkQuote':
                return this._requestBulkQuote();
            
            case 'getBulkQuote':
                return this._getBulkQuote(this.data.bulkQuoteId);

            case 'error':
                this._logger.log(`State machine is erroring with error: ${util.inspect(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for bulk quote ${this.data.bulkQuoteId}: ${util.inspect(args)}`);
        }
    }

    /**
     * Requests a bulk quote
     * Starts the quotes resolution process by sending a POST /bulkQuotes request to the switch;
     * then waits for a notification from the cache that the quotes response has been received.
     */
    async _requestBulkQuote() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a bulk quote request
            const bulkQuote = this._buildBulkQuoteRequest();

            // listen for events on the bulkQuoteId
            const bulkQuoteKey = `bulkQuote_${bulkQuote.bulkQuoteId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkQuoteKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkQuoteResponse') {
                        if (this._rejectExpiredQuoteResponses) {
                            const now = new Date().toISOString();
                            if (now > bulkQuote.expiration) {
                                const msg = 'Bulk quote response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.error(`${msg}: system time=${now} > expiration time=${bulkQuote.expiration}`);
                            }
                        }
                    } else if (message.type === 'bulkQuoteResponseError') {
                        error = new BackendError(`Got an error response requesting bulk quote: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    }
                    else {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk quote ${bulkQuoteKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk quote resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkQuoteResponseBody = message.data;
                    this._logger.push({ bulkQuoteResponseBody }).log('Bulk quote response received');

                    return resolve(bulkQuoteResponseBody);
                }
                catch (err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout requesting bulk quote ${this.data.bulkQuoteId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /bulkQuotes request to the switch
            try {
                const res = await this._requests.postBulkQuotes(bulkQuote, this.data.individualQuotes[0].to.fspId);
                this._logger.push({ res }).log('Bulk quote request sent to peer');
            }
            catch (err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Constructs a bulk quote request payload based on current state
     *
     * @returns {object} - the bulk quote request object
     */
    _buildBulkQuoteRequest() {
        const bulkQuoteRequest = {
            bulkQuoteId: this.data.bulkQuoteId,
            payer: shared.internalPartyToMojaloopParty(this.data.from, this._dfspId),
            expiration: this._getExpirationTimestamp(),
        };

        this.data.geoCode && (bulkQuoteRequest.geoCode = this.data.geoCode);

        if (this.data.extensions && this.data.extensions.length > 0) {
            bulkQuoteRequest.extensionList = {
                extension: this.data.extensions
            };
        }

        bulkQuoteRequest.individualQuotes = this.data.individualQuotes.map((individualQuote) => {
            const quoteId = individualQuote.quoteId || uuid();
            const quote = {
                quoteId: quoteId,
                transactionId: individualQuote.transactionId || quoteId,
                payee: shared.internalPartyToMojaloopParty(individualQuote.to, individualQuote.to.fspId),
                amountType: individualQuote.amountType,
                amount: {
                    currency: individualQuote.currency,
                    amount: individualQuote.amount
                },
                transactionType: {
                    scenario: individualQuote.transactionType,
                    // TODO: support payee initiated txns?
                    initiator: 'PAYER',
                    // TODO: defaulting to CONSUMER initiator type should
                    // be replaced with a required element on the incoming
                    // API request
                    initiatorType: this.data.from.type || 'CONSUMER'
                }
            };

            individualQuote.note && (quote.note = individualQuote.note);
            
            if (individualQuote.extensions && individualQuote.extensions.length > 0) {
                bulkQuoteRequest.extensionList = {
                    extension: individualQuote.extensions
                };
            }

            return quote;
        });

        return bulkQuoteRequest;
    }

    /**
     * Get bulk quote details by sending GET /bulkQuotes/{ID} request to the switch
     */
    async _getBulkQuote(bulkQuoteId) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const bulkQuoteKey = `bulkQuote_${bulkQuoteId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkQuoteKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkQuoteError') {
                        error = new BackendError(`Got an error response retrieving bulk quote: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    } else if (message.type !== 'bulkQuoteResponse') {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk quote ${bulkQuoteKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk quote response messages
                    this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkQuote = message.data;
                    this._logger.push({ bulkQuote }).log('Bulk quote response received');

                    return resolve(bulkQuote);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout getting bulk quote ${bulkQuoteId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /bulkQuotes/{ID} request to the switch
            try {
                const res = await this._requests.getBulkQuotes(bulkQuoteId);
                this._logger.push({ peer: res }).log('Bulk quote lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Returns an ISO-8601 format timestamp n-seconds in the future for expiration of a bulk quote API object,
     * where n is equal to our config setting "expirySeconds"
     *
     * @returns {string} - ISO-8601 format future expiration timestamp
     */
    _getExpirationTimestamp() {
        let now = new Date();
        return new Date(now.getTime() + (this._expirySeconds * 1000)).toISOString();
    }

    /**
     * Returns an object representing the final state of the bulk quote suitable for the outbound API
     *
     * @returns {object} - Response representing the result of the bulk quoting process
     */
    getResponse() {
        // we want to project some of our internal state into a more useful
        // representation to return to the SDK API consumer
        let resp = { ...this.data };

        switch(this.data.currentState) {
            case 'succeeded':
                resp.currentState = stateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = stateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.log(`Bulk quote model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
                resp.currentState = stateEnum.ERROR_OCCURRED;
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
            const res = await this._cache.set(`bulkQuoteModel_${this.data.bulkQuoteId}`, this.data);
            this._logger.push({ res }).log('Persisted bulk quote model in cache');
        }
        catch(err) {
            this._logger.push({ err }).log('Error saving bulk quote model');
            throw err;
        }
    }

    /**
     * Loads a bulk quote model from cache for resumption of the bulk quote process
     *
     * @param bulkQuoteId {string} - UUID bulkQuoteId of the model to load from cache
     */
    async load(bulkQuoteId) {
        try {
            const data = await this._cache.get(`bulkQuoteModel_${bulkQuoteId}`);
            if(!data) {
                throw new Error(`No cached data found for bulkQuoteId: ${bulkQuoteId}`);
            }
            await this.initialize(data);
            this._logger.push({ cache: this.data }).log('Bulk quote model loaded from cached state');
        }
        catch(err) {
            this._logger.push({ err }).log('Error loading bulk quote model');
            throw err;
        }
    }

    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    await this.stateMachine.requestBulkQuote();
                    this._logger.log(`Quotes resolved for bulk quote ${this.data.bulkQuoteId}`);
                    break;
                
                case 'getBulkQuote':
                    await this.stateMachine.getBulkQuote();
                    this._logger.log(`Get bulk quote ${this.data.bulkQuoteId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.log('Bulk quoting completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.log('State machine in errored state');
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            this._logger.log(`Bulk quote model state machine transition completed in state: ${this.stateMachine.state}. Recursing to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this._logger.log(`Error running bulk quote model: ${util.inspect(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a bulkQuoteState property here!
                if(err.bulkQuoteState) {
                    this._logger.log(`State machine is broken: ${util.inspect(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between bulkQuoteState.lastError and err
                err.bulkQuoteState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }
}


module.exports = OutboundBulkQuotesModel;
