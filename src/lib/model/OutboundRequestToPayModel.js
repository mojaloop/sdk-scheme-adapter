/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Murthy Kakarlamudi - murthy@modusbox.com                         *
 **************************************************************************/

'use strict';

const util = require('util');
const { uuid } = require('uuidv4');
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { BackendError } = require('./common');

const transferStateEnum = {
    'WAITING_FOR_PARTY_ACCEPTANCE': 'WAITING_FOR_PARTY_ACCEPTANCE',
    'WAITING_FOR_QUOTE_ACCEPTANCE': 'WAITING_FOR_QUOTE_ACCEPTANCE',
    'ERROR_OCCURRED': 'ERROR_OCCURRED',
    'COMPLETED': 'COMPLETED',
};

class OutboundRequestToPayModel {

    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._autoAcceptParty = config.autoAcceptParty;
        
        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });
    }

    /**
     * Initializes the transfer model
     *
     * @param data {object} - The inbound API POST /transfers request body
     */
    async initialize(data) {
        this.data = data;

        // add a transferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('transactionRequestId')) {
            this.data.transactionRequestId = uuid();
        }

        // initialize the transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = 'start';
        }

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
        this._logger.log(`Request To Pay ${this.data.transactionRequestId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case 'resolvePayee':
                // resolve the payee
                return this._resolvePayee();

            case 'executeTransactionRequest':
                // request a quote
                return this._executeTransactionRequest();

            case 'error':
                this._logger.log(`State machine is erroring with error: ${util.inspect(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for transfer ${this.data.transferId}: ${util.inspect(args)}`);
        }
    }

    /**
     * Updates the internal state representation to reflect that of the state machine itself
     */
    _afterTransition() {
        this._logger.log(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state}`);
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
            const payeeKey = `${this.data.to.idType}_${this.data.to.idValue}`
              + (this.data.to.idSubValue ? `_${this.data.to.idSubValue}` : '');

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(payeeKey, (cn, msg, subId) => {
                try {
                    let payee = JSON.parse(msg);

                    if(payee.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new BackendError(`Got an error response resolving party: ${util.inspect(payee)}`, 500);
                        err.mojaloopError = payee;

                        // cancel the timeout handler
                        clearTimeout(timeout);
                        return reject(err);
                    }

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

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                const res = await this._requests.getParties(this.data.to.idType, this.data.to.idValue,
                    this.data.to.idSubValue);
                this._logger.push({ peer: res }).log('Party lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(payeeKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${payeeKey} ${subId}: ${e.stack || util.inspect(e)}`);
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
            const transactionRequestKey = `tr_${this.data.transactionRequestId}`;

            const subId = await this._cache.subscribe(transactionRequestKey, async (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    // if (message.type === 'transactionRequestFail') {
                    //     error = new BackendError(`Got an error response processing transaction request: ${util.inspect(message.data)}`, 500);
                    //     error.mojaloopError = message.data;
                    // } else {
                    //     this._logger.push({ message }).log(`Ignoring cache notification for transfer ${transactionRequestKey}. Uknokwn message type ${message.type}.`);
                    //     return;
                    // }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transactionRequestKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${transactionRequestKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const transactionRequestResponse = message.data;
                    this._logger.push({ transactionRequestResponse }).log('Transaction Request Response received');
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
                    this._logger.log(`Error unsubscribing (in timeout handler) ${transactionRequestKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const res = await this._requests.postTransactionRequests(transactionRequest, this.data.to.fspId);
                this._logger.push({ res }).log('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transactionRequestKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${transactionRequestKey} ${subId}: ${e.stack || util.inspect(e)}`);
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
                scenario: this.data.scenario,
                initiator: this.data.initiator,
                initiatorType: this.data.initiatorType
            }
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
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
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
                    // next transition is to requestQuote
                    await this.stateMachine.executeTransactionRequest();
                    this._logger.log(`Transaction Request for ${this.data.transactionRequestId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.log('Transaction Request completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.log('State machine in errored state');
                    return;
            }

            // now call ourslves recursively to deal with the next transition
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
                resp.currentState = transferStateEnum.WAITING_FOR_PARTY_ACEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = transferStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = transferStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.log(`Transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
                resp.currentState = transferStateEnum.ERROR_OCCURRED;
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
            const res = await this._cache.set(`transactionRequest${this.data.transactionRequestId}`, this.data);
            this._logger.push({ res }).log('Persisted transaction request model in cache');
        }
        catch(err) {
            this._logger.push({ err }).log('Error saving transfer model');
            throw err;
        }
    }
}

module.exports = OutboundRequestToPayModel;