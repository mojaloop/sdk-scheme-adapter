/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

'use strict';

const safeStringify = require('fast-safe-stringify');
const idGenerator = require('@mojaloop/central-services-shared').Util.id;
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests, Errors } = require('@mojaloop/sdk-standard-components');
const { BackendError } = require('./common');

const { SDKStateEnum } = require('./common');


/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class AccountsModel {
    constructor(config) {
        this._idGenerator = idGenerator(config.idGenerator);
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.alsEndpoint,
            dfspId: config.dfspId,
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2: config.wso2,
        });
    }


    /**
     * Initializes the internal state machine object
     */
    _initStateMachine (initState) {
        this._stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: 'createAccounts', from: 'start', to: 'succeeded' },
                { name: 'error', from: '*', to: 'errored' },
            ],
            methods: {
                onTransition: this._handleTransition.bind(this),
                onAfterTransition: this._afterTransition.bind(this),
                onPendingTransition: (transition, from, to) => {
                    // allow transitions to 'error' state while other transitions are in progress
                    if(transition !== 'error') {
                        throw new BackendError(`Transition requested while another transition is in progress: ${transition} from: ${from} to: ${to}`, 500);
                    }
                }
            }
        });

        return this._stateMachine[initState];
    }


    /**
     * Updates the internal state representation to reflect that of the state machine itself
     */
    _afterTransition() {
        this._logger.isDebugEnabled && this._logger.debug(`State machine transitioned: ${this._data.currentState} -> ${this._stateMachine.state}`);
        this._data.currentState = this._stateMachine.state;
    }


    /**
     * Initializes the accounts model
     *
     * @param data {object} - The outbound API POST /accounts request body
     */
    async initialize(data) {
        this._data = data;

        // add a modelId if one is not present e.g. on first submission
        if(!this._data.hasOwnProperty('modelId')) {
            this._data.modelId = this._idGenerator();
        }

        // initialize the transfer state machine to its starting state
        if(!this._data.hasOwnProperty('currentState')) {
            this._data.currentState = 'start';
        }

        if(!this._data.hasOwnProperty('response')) {
            this._data.response = [];
        }

        this._initStateMachine(this._data.currentState);
    }


    /**
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.isDebugEnabled && this._logger.debug(`Request ${this._data.requestId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                return;

            case 'createAccounts':
                return this._createAccounts();

            case 'error':
                this._logger.isErrorEnabled && this._logger.error(`State machine is erroring with error: ${safeStringify(args)}`);
                this._data.lastError = args[0] || new BackendError('unspecified error', 500);
                break;

            default:
                this._logger.isDebugEnabled && this._logger.debug(`Unhandled state transition for request ${this._data.requestId}`);
        }
    }


    async _executeCreateAccountsRequest(request) {
        const accountRequest = request;

        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const requestKey = `ac_${accountRequest.requestId}`;

            const subId = await this._cache.subscribe(requestKey, async (cn, msg, subId) => {
                try {
                    let error;
                    const message = JSON.parse(msg);
                    this._data.postAccountsResponse = message.data;

                    if (message.type === 'accountsCreationErrorResponse') {
                        error = new BackendError(`Got an error response creating accounts: ${safeStringify(this._data.postAccountsResponse.body)}`, 500);
                        error.mojaloopError = this._data.postAccountsResponse.body;
                    } else if (message.type !== 'accountsCreationSuccessfulResponse') {
                        this._logger.push(safeStringify(this._data.postAccountsResponse)).debug(
                            `Ignoring cache notification for request ${requestKey}. ` +
                            `Unknown message type ${message.type}.`
                        );
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for account creation response messages.
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(requestKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${requestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const response = this._data.postAccountsResponse;
                    this._logger.isDebugEnabled && this._logger.push({ response }).debug('Account creation response received');
                    return resolve(response);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for response to account creation request ${accountRequest.requestId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(requestKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${requestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /participants request to the switch
            try {
                const res = await this._requests.postParticipants(accountRequest);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Account creation request sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(requestKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${requestKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }
        });
    }


    async _createAccounts() {
        const requests = this._buildRequests();
        for await (let request of requests) {
            const response = await this._executeCreateAccountsRequest(request);
            this._data.response.push(...this._buildClientResponse(response));
        }
    }

    _buildClientResponse(response) {
        return response.body.partyList.map(party => ({
            idType: party.partyId.partyIdType,
            idValue: party.partyId.partyIdentifier,
            idSubValue: party.partyId.partySubIdOrType,
            ...!response.body.currency && {
                error: {
                    statusCode: Errors.MojaloopApiErrorCodes.CLIENT_ERROR.code,
                    message: 'Provided currency not supported',
                }
            },
            ...party.errorInformation && {
                error: {
                    statusCode: party.errorInformation.errorCode,
                    message: party.errorInformation.errorDescription,
                },
            },
        }));
    }


    /**
     * Builds accounts creation requests payload from current state
     *
     * @returns {Array} - the account creation requests
     */
    _buildRequests() {
        const MAX_ITEMS_PER_REQUEST = 10000; // As per API Spec 6.2.2.2 (partyList field)

        const requests = [];
        for (let account of this._data.accounts) {
            let request = requests.find(req =>
                req.currency === account.currency && (req.partyList.length < MAX_ITEMS_PER_REQUEST));
            if (!request) {
                request = {
                    requestId: this._idGenerator(),
                    partyList: [],
                    currency: account.currency,
                };
                requests.push(request);
            }
            request.partyList.push({
                partyIdType: account.idType,
                partyIdentifier: account.idValue,
                partySubIdOrType: account.idSubValue,
                fspId: this._dfspId,
            });
        }
        return requests;
    }

    /**
     * Returns an object representing the final state of the transfer suitable for the outbound API
     *
     * @returns {object} - Response representing the result of the transfer process
     */
    getResponse() {
        // we want to project some of our internal state into a more useful
        // representation to return to the SDK API consumer
        const resp = { ...this._data };

        switch(this._data.currentState) {
            case 'succeeded':
                resp.currentState = SDKStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.isDebugEnabled && this._logger.debug(
                    `Account model response being returned from an unexpected state: ${this._data.currentState}. ` +
                    'Returning ERROR_OCCURRED state'
                );
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
                break;
        }
        return resp;
    }


    /**
     * Persists the model state to cache for reinitialisation at a later point
     */
    async _save() {
        try {
            this._data.currentState = this._stateMachine.state;
            const res = await this._cache.set(`accountModel_${this._data.modelId}`, this._data);
            this._logger.isDebugEnabled && this._logger.push({ res }).debug('Persisted account model in cache');
        }
        catch(err) {
            this._logger.push({ err }).error('Error saving account model');
            throw err;
        }
    }


    /**
     * Loads an accounts model from cache for resumption of the accounts management process
     *
     * @param modelId {string} - UUID of the model to load from cache
     */
    async load(modelId) {
        try {
            const data = await this._cache.get(`accountModel_${modelId}`);
            if(!data) {
                throw new BackendError(`No cached data found for account model with id: ${modelId}`, 500);
            }
            await this.initialize(data);
            this._logger.isDebugEnabled && this._logger.push({ cache: this._data }).debug('Account model loaded from cached state');
        }
        catch(err) {
            this._logger.push({ err }).error('Error loading account model');
            throw err;
        }
    }


    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this._data.currentState) {
                case 'start': {
                    await this._stateMachine.createAccounts();
                    const accounts = this._data.response;
                    const failCount = accounts.filter((account) => account.error).length;
                    const successCount = this._data.response.length - failCount;
                    this._logger.isDebugEnabled && this._logger.debug(`Accounts created: ${successCount} succeeded, ${failCount} failed`);
                    // if (failCount > 0) {
                    //     throw new BackendError(`Failed to create ${failCount} account(s)`, 500);
                    // }
                    break;
                }

                case 'succeeded':
                    // all steps complete so return
                    this._logger.isDebugEnabled && this._logger.debug('Accounts creation completed');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.isErrorEnabled && this._logger.error('State machine in errored state');
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            this._logger.isDebugEnabled && this._logger.debug(
                `Account model state machine transition completed in state: ${this._stateMachine.state}. ` +
                'Handling next transition.'
            );
            return this.run();
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.error(`Error running account model: ${safeStringify(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this._data.currentState !== 'errored') {
                // err should not have a executionState property here!
                if(err.executionState) {
                    this._logger.isErrorEnabled && this._logger.error(`State machine is broken: ${safeStringify(err)}`);
                }
                // transition to errored state
                await this._stateMachine.error(err);

                // avoid circular ref between executionState.lastError and err
                err.executionState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }
}


module.exports = AccountsModel;
