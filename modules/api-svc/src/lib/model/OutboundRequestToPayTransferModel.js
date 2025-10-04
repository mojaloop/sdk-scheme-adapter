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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const safeStringify = require('fast-safe-stringify');
const idGenerator = require('@mojaloop/central-services-shared').Util.id;
const StateMachine = require('javascript-state-machine');
const { Ilp, MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const shared = require('./lib/shared');
const { BackendError } = require('./common');
const PartiesModel = require('./PartiesModel');

const { SDKStateEnum, TransactionRequestStateEnum } = require('./common');

/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class OutboundRequestToPayTransferModel {
    constructor(config) {
        this._idGenerator = idGenerator(config.idGenerator);
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;
        this._rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;
        this._autoAcceptQuotes = config.autoAcceptQuotes;
        this._autoAcceptR2PBusinessQuotes = config.autoAcceptR2PBusinessQuotes;
        this._autoAcceptR2PDeviceOTP = config.autoAcceptR2PDeviceOTP;
        this._useQuoteSourceFSPAsTransferPayeeFSP = config.useQuoteSourceFSPAsTransferPayeeFSP;
        this._checkIlp = config.checkIlp;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            authorizationsEndpoint: config.authorizationsEndpoint,
            transactionRequestsEndpoint: config.transactionRequestsEndpoint,
            transfersEndpoint: config.transfersEndpoint,
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

        this._ilp = Ilp.ilpFactory(Ilp.ILP_VERSIONS.v1, {
            secret: config.ilpSecret,
            logger: this._logger,
        });
    }
    /**
     * Initializes the requestToPayTransfer model
     *
     * @param data {object} - The inbound API POST /requestToPayTransfer request body
     */
    async initialize(data) {
        this.data = data;

        // add a transferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('transferId')) {
            this.data.transferId = this._idGenerator();
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
                { name: 'requestQuote', from: 'start', to: 'quoteReceived' },
                { name: 'requestOTP', from: 'quoteReceived', to: 'otpReceived' },
                { name: 'skipOTP', from: 'quoteReceived', to: 'otpReceived' },
                { name: 'executeTransfer', from: 'otpReceived', to: 'succeeded' },
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
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    // next transition is to requestQuote
                    await this.stateMachine.requestQuote();
                    this._logger.isDebugEnabled && this._logger.debug(`Quote received for transfer ${this.data.transferId}`);
                    if(
                        (this.stateMachine.state === 'quoteReceived' && this.data.initiatorType !== 'BUSINESS')
                        || (this.data.initiatorType === 'BUSINESS' && !this._autoAcceptR2PBusinessQuotes)
                    ) {
                        //we break execution here and return the quote response details to allow asynchronous accept or reject
                        //of the quote
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'quoteReceived':
                    if (!this.data.authenticationType) {
                        // Skipping otp step
                        this._logger.isDebugEnabled && this._logger.debug(`Skipping authorization for transactionRequestId: ${this.data.transactionRequestId} as authenticationType is not provided`);
                        // this.data.currentState = 'otpReceived'
                        await this.stateMachine.skipOTP();
                        break;
                    } else if (this.data.authenticationType === 'OTP') {
                        await this.stateMachine.requestOTP();
                    } else {
                        // await this.stateMachine.error(err);
                        await this.stateMachine.error('authenticationType is not supported');
                        await this._save();
                        return this.getResponse();
                    }
                    // next transition is requestOTP
                    if(this.data.initiatorType !== 'BUSINESS') {
                        this._logger.isDebugEnabled && this._logger.debug(`OTP received for transactionRequestId: ${this.data.transactionRequestId} and transferId: ${this.data.transferId}`);
                        if(this.stateMachine.state === 'otpReceived' && !this._autoAcceptR2PDeviceOTP) {
                            //we break execution here and return the otp response details to allow asynchronous accept or reject
                            //of the quote
                            await this._save();
                            return this.getResponse();
                        }
                    }
                    break;

                case 'otpReceived':
                    // next transition is executeTransfer
                    await this.stateMachine.executeTransfer();
                    this._logger.isDebugEnabled && this._logger.debug(`Transfer ${this.data.transferId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.isDebugEnabled && this._logger.debug('Transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.isErrorEnabled && this._logger.error('State machine in errored state');
                    return;
            }

            // now call ourslves recursively to deal with the next transition
            this._logger.isDebugEnabled && this._logger.debug(`RequestToPay Transfer model state machine transition completed in state: ${this.stateMachine.state}. Recusring to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.error(`Error running transfer model: ${safeStringify(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a transferState property here!
                if(err.transferState) {
                    this._logger.isErrorEnabled && this._logger.error(`State machine is broken: ${safeStringify(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between transferState.lastError and err
                err.transferState = structuredClone(this.getResponse());
            }
            throw err;
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
     * Handles state machine transitions
     */
    async _handleTransition(lifecycle, ...args) {
        this._logger.isDebugEnabled && this._logger.debug(`Transfer ${this.data.transferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch(lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case 'requestQuote':
                // request a quote
                return this._requestQuote();

            case 'requestOTP':
                // request an OTP
                return this._requestOTP();

            case 'skipOTP':
                // Skip OTP request
                return;

            case 'executeTransfer':
                // prepare a transfer and wait for fulfillment
                return this._executeTransfer();

            case 'error':
                this._logger.isErrorEnabled && this._logger.error(`State machine is erroring with error: ${safeStringify(args)}`);
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            default:
                throw new Error(`Unhandled state transition for transfer ${this.data.transferId}: ${safeStringify(args)}`);
        }
    }

    /**
     * This method is used to communicate back to the Payee that a rejection is being
     * sent because the OTP did not match.
     */
    async rejectRequestToPay() {
        const mojaloopResponse = {
            transactionRequestState: TransactionRequestStateEnum.REJECTED
        };
        await this._requests.putTransactionRequests(this.data.transactionRequestId, JSON.stringify(mojaloopResponse), this.data.to.fspId);
        const response = {
            status : `${this.data.transactionRequestId} has been ${TransactionRequestStateEnum.REJECTED}`
        };
        return JSON.stringify(response);
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
                    let payee = JSON.parse(msg);
                    if(payee.body && payee.body.errorInformation) {
                        // this is an error response to our GET /parties request
                        const err = new BackendError(`Got an error response resolving party: ${safeStringify(payee.body)}`, 500);
                        err.mojaloopError = payee.body;

                        // cancel the timeout handler
                        clearTimeout(timeout);
                        return reject(err);
                    }

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

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(quoteKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'quoteResponse') {
                        if (this._rejectExpiredQuoteResponses) {
                            const now = new Date().toISOString();
                            if (now > quote.expiration) {
                                const msg = 'Quote response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.isErrorEnabled && this._logger.error(`${msg}: system time=${now} > expiration time=${quote.expiration}`);
                            }
                        }
                    } else if (message.type === 'quoteResponseError') {
                        error = new BackendError(`Got an error response requesting quote: ${safeStringify(message.data.body)}`, 500);
                        error.mojaloopError = message.data.body;
                    }
                    else {
                        this._logger.isDebugEnabled && this._logger.push({ message }).debug(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for payee resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(quoteKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${quoteKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const quoteResponseBody = message.data.body;
                    const quoteResponseHeaders = message.data.headers;
                    this._logger.isDebugEnabled && this._logger.push({ quoteResponseBody }).debug('Quote response received');

                    this.data.quoteResponse = {
                        body: quoteResponseBody,
                        headers: quoteResponseHeaders
                    };
                    this.data.quoteResponseSource = quoteResponseHeaders['fspiop-source'];

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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${quoteKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /quotes request to the switch
            try {
                const res = await this._requests.postQuotes(quote, this.data.to.fspId);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Quote request sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(quoteKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${quoteKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Sends request for
     * Starts the quote resolution process by sending a POST /quotes request to the switch;
     * then waits for a notification from the cache that the quote response has been received
     */
    async _requestOTP() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {

            if( this.data.initiatorType && this.data.initiatorType === 'BUSINESS') return resolve();

            // listen for events on the quoteId
            const otpKey = `otp_${this.data.transactionRequestId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(otpKey, (cn, msg, subId) => {
                try {
                    let authorizationResponse = JSON.parse(msg);

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for payee resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(otpKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${otpKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    const authorizationResponseBody = authorizationResponse.data;
                    this._logger.push({ authorizationResponseBody }).debug('OTP response received');

                    this.data.authorizationResponse = authorizationResponseBody;

                    return resolve(authorizationResponse);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout requesting quote for transfer ${this.data.transferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(otpKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${otpKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /authorizations request to the switch
            try {
                const res = await this._requests.getAuthorizations(this.data.transactionRequestId,`authenticationType=OTP&retriesLeft=1&amount=${this.data.amount}&currency=${this.data.currency}`,this.data.to.fspId);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Authorizations request sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(otpKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${otpKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
            quoteId: this._idGenerator(),
            transactionId: this.data.transferId,
            transactionRequestId: this.data.transactionRequestId,
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
            scenario: this.data.scenario,
            subScenario: this.data.subScenario,
            initiator: this.data.initiator,
            initiatorType: this.data.initiatorType
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

            const subId = await this._cache.subscribe(transferKey, async (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transferFulfil') {
                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > prepare.expiration) {
                                const msg = 'Transfer fulfil missed expiry deadline';
                                this._logger.isErrorEnabled && this._logger.error(`${msg}: system time=${now} > expiration=${prepare.expiration}`);
                                error = new BackendError(msg, 504);
                            }
                        }
                    } else if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response preparing transfer: ${safeStringify(message.data.body)}`, 500);
                        error.mojaloopError = message.data.body;
                    } else {
                        this._logger.isDebugEnabled && this._logger.push({ message }).debug(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this._logger.isDebugEnabled && this._logger.push({ fulfil }).debug('Transfer fulfil received');
                    this.data.fulfil = fulfil;

                    if(this._checkIlp && !this._ilp.validateFulfil(fulfil.body.fulfilment, this.data.quoteResponse.body.condition)) {
                        throw new Error('Invalid fulfilment received from peer DFSP.');
                    }

                    return resolve(fulfil);
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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource);
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in error handler) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
                        error = new BackendError(`Got an error response retrieving transfer: ${safeStringify(message.data.body)}`, 500);
                        error.mojaloopError = message.data.body;
                    } else if (message.type !== 'transferFulfil') {
                        this._logger.isErrorEnabled && this._logger.push({ message }).error(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this._logger.isDebugEnabled && this._logger.push({ fulfil }).debug('Transfer fulfil received');
                    this.data.fulfil = fulfil;

                    return resolve(this.data);
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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /transfers request to the switch
            try {
                const res = await this._requests.getTransfers(this.data.transferId);
                this._logger.isDebugEnabled && this._logger.push({ peer: res }).debug('Transfer lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
            case 'quoteReceived':
                resp.currentState = SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case 'otpReceived':
                resp.currentState = SDKStateEnum.WAITING_FOR_AUTH_ACCEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = SDKStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = SDKStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.isDebugEnabled && this._logger.debug(`Transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
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
            const res = await this._cache.set(`requestToPayTransferModel_${this.data.transactionRequestId}`, this.data);
            this._logger.isDebugEnabled && this._logger.push({ res }).debug('Persisted transfer model in cache');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error saving transfer model');
            throw err;
        }
    }


    /**
     * Loads a transfer model from cache for resumption of the transfer process
     *
     * @param transferId {string} - UUID transferId of the model to load from cache
     */
    async load(transactionRequestId) {
        try {
            const data = await this._cache.get(`requestToPayTransferModel_${transactionRequestId}`);
            if(!data) {
                throw new Error(`No cached data found for transactionRequestId: ${transactionRequestId}`);
            }
            await this.initialize(data);
            this._logger.isDebugEnabled && this._logger.push({ cache: this.data }).debug('RequestToPay Transfer model loaded from cached state');
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error loading transfer model');
            throw err;
        }
    }



}


module.exports = OutboundRequestToPayTransferModel;
