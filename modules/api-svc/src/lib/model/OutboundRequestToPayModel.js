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

 * Modusbox
 - Murthy Kakarlamudi <murthy@modusbox.com>
 --------------
 ******/
'use strict';

const safeStringify = require('fast-safe-stringify');
const idGenerator = require('@mojaloop/central-services-shared').Util.id;
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { BackendError } = require('./common');
const PartiesModel = require('./PartiesModel');

const { SDKStateEnum } = require('./common');

class OutboundRequestToPayModel {

    constructor(config) {
        this._idGenerator = idGenerator(config.idGenerator);
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._autoAcceptR2PParty = config.autoAcceptR2PParty;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
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
    }

    /**
     * Initializes the request to pay model
     *
     * @param data {object} - The inbound API POST /requestToPay request body
     */
    async initialize(data) {
        this.data = data;

        // add a transactionRequestId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('transactionRequestId')) {
            this.data.transactionRequestId = this._idGenerator();
        }

        // initialize the transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

        //Set fsp id in the from section of the request that gets sent back in the response
        this.data.from.fspId = this._dfspId;

        this._initStateMachine(this.data.currentState);
    }

    /**
     * Initializes the internal state machine object
     */
    _initStateMachine (initState) {
        this.stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: 'resolvePayee', from: 'start', to: 'payeeResolved' },
                { name: 'executeTransactionRequest', from: 'payeeResolved', to: 'succeeded' },
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
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.isDebugEnabled && this._logger.debug(`Request To Pay ${this.data.transactionRequestId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case 'resolvePayee':
                // resolve the payee
                return this._resolvePayee();

            case 'executeTransactionRequest':
                // call request to pay
                return this._executeTransactionRequest();

            case 'error':
                this._logger.isErrorEnabled && this._logger.error(`State machine is erroring with error: ${safeStringify(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for transfer ${this.data.transferId}: ${safeStringify(args)}`);
        }
    }

    /**
     * Updates the internal state representation to reflect that of the state machine itself
     */
    _afterTransition() {
        this._logger.isDebugEnabled && this._logger.debug(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
        this.data.currentState = this.stateMachine.state;
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

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(payeeKey, (cn, msg, subId) => {
                try {
                    this.data.getPartiesResponse = JSON.parse(msg);
                    if(this.data.getPartiesResponse.body.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new BackendError(`Got an error response resolving party: ${safeStringify(this.data.getPartiesResponse.body, { depth: Infinity })}`, 500);
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
                        return reject(new Error(`Resolved payee has no party object: ${safeStringify(payee)}`));
                    }

                    payee = payee.party;

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    this._logger.isDebugEnabled && this._logger.push({ payee }).debug('Payee resolved');

                    // stop listening for payee resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(payeeKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${payeeKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
                        const err = new Error(`Expecting resolved payee party to have an FSPID: ${safeStringify(payee.partyIdInfo)}`);
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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${payeeKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                const res = await this._requests.getParties(this.data.to.idType, this.data.to.idValue,
                    this.data.to.idSubValue);
                this._logger.isDebugEnabled && this._logger.push({ peer: res }).debug('Party lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(payeeKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing ${payeeKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }
        });
    }

    async _executeTransactionRequest() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a transfer prepare request
            const transactionRequest = this._buildTransactionRequest();

            // listen for events on the transactionRequestId
            const transactionRequestKey = `txnreq_${this.data.transactionRequestId}`;

            const subId = await this._cache.subscribe(transactionRequestKey, async (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transactionRequestResponseError') {
                        error = new BackendError(`Got an error response processing transaction request: ${safeStringify(message.data)}`, 500);
                        error.mojaloopError = message.data;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transactionRequestKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${transactionRequestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const transactionRequestResponse = message.data;
                    this._logger.push({ transactionRequestResponse }).debug('Transaction Request Response received');
                    this.data.transactionRequestResponse = transactionRequestResponse;

                    return resolve(transactionRequestResponse);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for fulfil for transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transactionRequestKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${transactionRequestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const res = await this._requests.postTransactionRequests(transactionRequest, this.data.to.fspId);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transactionRequestKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${transactionRequestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Builds a transaction request payload from current state
     *
     * @returns {object} - the transaction request payload
     */
    _buildTransactionRequest() {
        let transactionRequest = {
            transactionRequestId: this.data.transactionRequestId,
            payer: {
                partyIdType: this.data.from.idType,
                partyIdentifier: this.data.from.idValue,
                fspId: this._dfspId
            },
            payee: {
                partyIdInfo: {
                    partyIdType: this.data.to.idType,
                    partyIdentifier: this.data.to.idValue,
                    fspId: this.data.to.fspId,
                },
                personalInfo: {
                    complexName: {
                        firstName: this.data.to.firstName,
                        middleName: this.data.to.middleName,
                        lastName: this.data.to.lastName
                    },
                    dateOfBirth: this.data.to.dateOfBirth
                }
            },
            amount: {
                currency: this.data.currency,
                amount: this.data.amount
            },
            transactionType: {
                scenario: this.data.transactionType,
                subScenario: this.data.subScenario,
                initiator: 'PAYEE',
                initiatorType: this.data.from.type || 'CONSUMER'
            },
            authenticationType: this.data.authenticationType
        };

        // add extensions list if provided
        // if(this.data.transferRequestExtensions && this.data.transferRequestExtensions.length > 0) {
        //     prepare.extensionList = {
        //         extension: this.data.transferRequestExtensions
        //     };
        // }

        return transactionRequest;
    }

    /**
     * Loads a transfer model from cache for resumption of the transfer process
     *
     * @param transferId {string} - UUID transferId of the model to load from cache
     */
    async load(transactionRequestId) {
        try {
            const data = await this._cache.get(`txnReqModel_${transactionRequestId}`);
            if(!data) {
                throw new Error(`No cached data found for transactionRequestId: ${transactionRequestId}`);
            }
            await this.initialize(data);
            this._logger.isDebugEnabled && this._logger.push({ cache: this.data }).debug('TransactionRequest model loaded from cached state');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ error: err }).error('Error loading transfer model');
            throw err;
        }
    }

    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        const { transferId, transactionRequestId } = this.data;
        const log = this._logger.push({ transferId, transactionRequestId });
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    // next transition is to resolvePayee
                    await this.stateMachine.resolvePayee();
                    log.isInfoEnabled && log.info('Payee resolved for RequestToPay transfer');
                    if(this.stateMachine.state === 'payeeResolved' && !this._autoAcceptR2PParty) {
                        //we break execution here and return the resolved party details to allow asynchronous accept or reject
                        //of the resolved party
                        log.isInfoEnabled && log.info('Waiting for asynchronous accept or reject of resolved party');
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'payeeResolved':
                    // next transition is to requestQuote
                    await this.stateMachine.executeTransactionRequest();
                    log.isInfoEnabled && log.info('Transaction Request has been completed');
                    break;

                case 'succeeded':
                    // all steps complete so return
                    log.isInfoEnabled && log.info('Transaction Request completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.isErrorEnabled && this._logger.error('State machine in errored state');
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            log.isVerboseEnabled && log.verbose(`RequestToPay model state machine transition completed in state: ${this.stateMachine.state}. Recursing to handle next transition.`);
            return this.run();
        }
        catch(err) {
            log.isErrorEnabled && log.error(`Error running RequestToPay model: ${err?.message}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a lastError property here!
                if(err.lastError) {
                    log.isWarnEnabled && log.warn('State machine is broken');
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between transferState.lastError and err
                err.lastError = structuredClone(this.getResponse());
            }
            throw err;
        }
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
                resp.currentState = SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = SDKStateEnum.COMPLETED;
                resp.transactionRequestId = this.data.transactionRequestId;
                break;

            case 'errored':
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.isDebugEnabled && this._logger.debug(`Transaction Request model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
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
            const res = await this._cache.set(`txnReqModel_${this.data.transactionRequestId}`, this.data);
            this._logger.isDebugEnabled && this._logger.push({ res }).debug('Persisted transaction request model in cache');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ error: err }).error('Error saving transfer model');
            throw err;
        }
    }
}

module.exports = OutboundRequestToPayModel;
