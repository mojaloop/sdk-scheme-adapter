/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Infitx
 - Steven Oderayi <steven.oderayi@infitx.com>

 --------------
 ******/
'use strict';

const safeStringify = require('fast-safe-stringify');
const idGenerator = require('@mojaloop/central-services-shared').Util.id;
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { BackendError } = require('./common');
const shared = require('./lib/shared');
const { SDKStateEnum } = require('./common');

/**
 *  Models the state machine and operations required for performing an outbound bulk transfer
 */
class OutboundBulkTransfersModel {
    constructor(config) {
        this._idGenerator = idGenerator(config.idGenerator);
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
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            oidc: config.oidc,
            resourceVersions: config.resourceVersions,
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
        this._logger.isDebugEnabled && this._logger.debug(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
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
            this.data.bulkTransferId = this._idGenerator();
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
        this._logger.isDebugEnabled && this._logger.debug(`Bulk transfer ${this.data.bulkTransferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                return;

            case 'executeBulkTransfer':
                return this._executeBulkTransfer();

            case 'getBulkTransfer':
                return this._getBulkTransfer(this.data.bulkTransferId);

            case 'error':
                this._logger.isErrorEnabled && this._logger.error(`State machine is erroring with error: ${safeStringify(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for bulk transfer ${this.data.bulkTransferId}: ${safeStringify(args)}`);
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

                    if (message.type === 'bulkTransferResponse') {
                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > bulkTransferPrepare.expiration) {
                                const msg = 'Bulk transfer fulfils missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.isErrorEnabled && this._logger.error(`${msg}: system time=${now} > expiration time=${bulkTransferPrepare.expiration}`);
                            }
                        }
                    } else if (message.type === 'bulkTransferResponseError') {
                        error = new BackendError(`Got an error response preparing bulk transfer: ${safeStringify(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    }
                    else {
                        this._logger.isDebugEnabled && this._logger.push({ message }).debug(`Ignoring cache notification for bulk transfer ${bulkTransferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk transfer resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkTransferFulfil = message.data;
                    this.data.bulkTransfersResponse = bulkTransferFulfil.body;
                    this._logger.isDebugEnabled && this._logger.push({ bulkTransferFulfil }).debug('Bulk transfer fulfils received');

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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /bulkTransfers request to the switch
            try {
                const res = await this._requests.postBulkTransfers(bulkTransferPrepare, bulkTransferPrepare.payeeFsp);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Bulk transfer request sent to peer');
            }
            catch (err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
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

            const transferId = individualTransfer.transferId || this._idGenerator();

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

                    if (message.type === 'bulkTransferResponseError') {
                        error = new BackendError(`Got an error response retrieving bulk transfer: ${safeStringify(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    } else if (message.type !== 'bulkTransferResponse') {
                        this._logger.isDebugEnabled && this._logger.push({ message }).debug(`Ignoring cache notification for bulk transfer ${bulkTransferKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk transfer fulfil messages
                    this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfils = message.data;
                    this._logger.isDebugEnabled && this._logger.push({ fulfils }).debug('Bulk transfer fulfils received');

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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /bulkTransfers/{ID} request to the switch
            try {
                const res = await this._requests.getBulkTransfers(bulkTransferId);
                this._logger.isDebugEnabled && this._logger.push({ peer: res }).debug('Bulk transfer lookup sent to peer');
            }
            catch(err) {
                // cancel the timeout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing ${bulkTransferKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
        // let resp = { ...this.data };
        let resp = shared.mojaloopBulkTransfersResponseToInternal(this.data);

        switch(this.data.currentState) {
            case 'succeeded':
                resp.currentState = SDKStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.isDebugEnabled && this._logger.debug(`Bulk transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
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
            this._logger.isDebugEnabled && this._logger.push({ res }).debug('Persisted bulk transfer model in cache');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error saving bulk transfer model');
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
            this._logger.isDebugEnabled && this._logger.push({ cache: this.data }).debug('Bulk transfer model loaded from cached state');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error loading bulk transfer model');
            throw err;
        }
    }

    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        const log = this._logger.push({ bulkTransferId: this.data.bulkTransferId });
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    await this.stateMachine.executeBulkTransfer();
                    log.isInfoEnabled && log.info('Bulk transfer has been started');
                    break;

                case 'getBulkTransfer':
                    await this.stateMachine.getBulkTransfer();
                    log.isInfoEnabled && log.info('Get bulk transfer has been completed');
                    break;

                case 'succeeded':
                    // all steps complete so return
                    log.isInfoEnabled && log.info('Bulk transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    log.isWarnEnabled && log.warn('State machine in errored state');
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            log.isVerboseEnabled && log.verbose(`Bulk transfer model state machine transition completed in state: ${this.stateMachine.state}. Recursing to handle next transition.`);
            return this.run();
        }
        catch(err) {
            log.isErrorEnabled && log.push({ err }).error(`Error running bulk transfer model: ${err.message}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a bulkTransferState property here!
                if(err.bulkTransferState) {
                    log.isWarnEnabled && log.warn('State machine is broken');
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between bulkTransferState.lastError and err
                err.bulkTransferState = structuredClone(this.getResponse());
            }
            throw err;
        }
    }

}


module.exports = OutboundBulkTransfersModel;
