/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
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
const { BackendError } = require('./common');

const stateEnum = {
    'ERROR_OCCURRED': 'ERROR_OCCURRED',
    'COMPLETED': 'COMPLETED',
};

/**
 *  Models the state machine and operations required for performing an outbound bulk transfer
 */
class OutboundBulkTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            bulkTransfersEndpoint: config.bulkTransfersEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });
    }

    /**
     * Initializes the internal state machine object
     */
    _initStateMachine (initState) {
        this.stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: 'executeBulkTransfer', from: 'start', to: 'succeeded' },
                { name: 'getBulkTransfer', to: 'succeeded' },
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
     * Initializes the bulk transfer model
     *
     * @param data {object} - The inbound API POST /bulkTransfers request body
     */
    async initialize(data) {
        this.data = data;

        // add a bulkTransferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('bulkTransferId')) {
            this.data.bulkTransferId = uuid();
        }

        // initialize the bulk transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

        this._initStateMachine(this.data.currentState);
    }

    /**
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.log(`Bulk transfer ${this.data.bulkTransferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                return;

            case 'executeBulkTransfer':
                return this._executeBulkTransfer();

            case 'getBulkTransfer':
                return this._getBulkTransfer(this.data.bulkTransferId);

            case 'error':
                this._logger.log(`State machine is erroring with error: ${util.inspect(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for bulk transfer ${this.data.bulkTransferId}: ${util.inspect(args)}`);
        }
    }

    /**
     * Executes a bulk transfer
     * Starts the transfer process by sending a POST /bulkTransfers (prepare) request to the switch;
     * then waits for a notification from the cache that the transfer has been fulfilled
     */
    async _executeBulkTransfer() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a bulk transfer request
            const bulkTransferPrepare = this._buildBulkTransferPrepareRequest();

            // listen for events on the bulkTransferId
            const bulkTransferKey = `bulkTransfer_${this.data.bulkTransferId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkTransferKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkTransferFulfil') {
                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > bulkTransferPrepare.expiration) {
                                const msg = 'Bulk transfer fulfils missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.error(`${msg}: system time=${now} > expiration time=${bulkTransferPrepare.expiration}`);
                            }
                        }
                    } else if (message.type === 'bulkTransferError') {
                        error = new BackendError(`Got an error response preparing bulk transfer: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    }
                    else {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk transfer ${bulkTransferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk transfer resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkTransferFulfil = message.data;
                    this._logger.push({ bulkTransferFulfil }).log('Bulk transfer fulfils received');

                    return resolve(bulkTransferFulfil);
                }
                catch (err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for fulfil for bulk transfer ${this.data.bulkTransferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /bulkTransfers request to the switch
            try {
                const res = await this._requests.postBulkTransfers(bulkTransferPrepare, this.data.from.fspId);
                this._logger.push({ res }).log('Bulk transfer request sent to peer');
            }
            catch (err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Constructs a bulk transfer request payload
     *
     * @returns {object} - the bulk transfer request object
     */
    _buildBulkTransferPrepareRequest() {
        const bulkTransferRequest = {
            bulkTransferId: this.data.bulkTransferId,
            bulkQuoteId: this.data.bulkQuoteId,
            payerFsp: this._dfspId,
            payeeFsp: this.data.individualTransfers[0].to.fspId,
            expiration: this._getExpirationTimestamp()
        };

        // add extensionList if provided
        if (this.data.extensions && this.data.extensions.length > 0) {
            bulkTransferRequest.extensionList = {
                extension: this.data.extensions
            };
        }

        bulkTransferRequest.individualTransfers = this.data.individualTransfers.map((individualTransfer) => {
            if (bulkTransferRequest.payeeFsp !== individualTransfer.to.fspId) throw new BackendError('payee fsps are not the same into the whole bulk', 500);

            const transferId = individualTransfer.transferId || uuid();

            const transferPrepare = {
                transferId: transferId,
                transferAmount: {
                    currency: individualTransfer.currency,
                    amount: individualTransfer.amount
                },
                ilpPacket: individualTransfer.ilpPacket,
                condition: individualTransfer.condition,
            };
            
            if (individualTransfer.extensions && individualTransfer.extensions.length > 0) {
                bulkTransferRequest.extensionList = {
                    extension: individualTransfer.extensions
                };
            }


            return transferPrepare;
        });

        return bulkTransferRequest;
    }

    /**
     * Get bulk transfer details by sending GET /bulkTransfers/{ID} request to the switch
     */
    async _getBulkTransfer(bulkTransferId) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const bulkTransferKey = `bulkTransfer_${bulkTransferId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkTransferKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkTransferError') {
                        error = new BackendError(`Got an error response retrieving bulk transfer: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    } else if (message.type !== 'bulkTransferFulfil') {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk transfer ${bulkTransferKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk transfer fulfil messages
                    this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfils = message.data;
                    this._logger.push({ fulfils }).log('Bulk transfer fulfils received');

                    return resolve(fulfils);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout getting bulk transfer ${bulkTransferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /bulkTransfers/{ID} request to the switch
            try {
                const res = await this._requests.getBulkTransfers(bulkTransferId);
                this._logger.push({ peer: res }).log('Bulk transfer lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
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
     * Returns an object representing the final state of the bulk transfer suitable for the outbound API
     *
     * @returns {object} - Response representing the result of the bulk transfer process
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
                this._logger.log(`Bulk transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
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
            const res = await this._cache.set(`bulkTransferModel_${this.data.bulkTransferId}`, this.data);
            this._logger.push({ res }).log('Persisted bulk transfer model in cache');
        }
        catch(err) {
            this._logger.push({ err }).log('Error saving bulk transfer model');
            throw err;
        }
    }


    /**
     * Loads a bulk transfer model from cache for resumption of the bulk transfer process
     *
     * @param bulkTransferId {string} - UUID bulkTransferId of the model to load from cache
     */
    async load(bulkTransferId) {
        try {
            const data = await this._cache.get(`bulkTransferModel_${bulkTransferId}`);
            if(!data) {
                throw new Error(`No cached data found for bulkTransferId: ${bulkTransferId}`);
            }
            await this.initialize(data);
            this._logger.push({ cache: this.data }).log('Bulk transfer model loaded from cached state');
        }
        catch(err) {
            this._logger.push({ err }).log('Error loading bulk transfer model');
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
                    await this.stateMachine.executeBulkTransfer();
                    this._logger.log(`Bulk transfer ${this.data.bulkTransferId} has been completed`);
                    break;

                case 'getBulkTransfer':
                    await this.stateMachine.getBulkTransfer();
                    this._logger.log(`Get bulk transfer ${this.data.bulkTransferId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.log('Bulk transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.log('State machine in errored state');
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            this._logger.log(`Bulk transfer model state machine transition completed in state: ${this.stateMachine.state}. Recursing to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this._logger.log(`Error running transfer model: ${util.inspect(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a bulkTransferState property here!
                if(err.bulkTransferState) {
                    this._logger.log(`State machine is broken: ${util.inspect(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between bulkTransferState.lastError and err
                err.bulkTransferState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }

}


module.exports = OutboundBulkTransfersModel;
