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

const { randomBytes } = require('node:crypto');
const safeStringify = require('fast-safe-stringify');
const StateMachine = require('javascript-state-machine');
const { Enum, Util: { id: idGenerator } } = require('@mojaloop/central-services-shared');
const { Ilp, MojaloopRequests } = require('@mojaloop/sdk-standard-components');

const { API_TYPES } = require('../../constants');
const { generateTraceparent } = require('../../lib/utils');
const dto = require('../dto');
const shared = require('./lib/shared');
const PartiesModel = require('./PartiesModel');
const {
    AmountTypes,
    BackendError,
    TimeoutError,
    CacheKeyPrefixes,
    Directions,
    ErrorMessages,
    Initiator,
    InitiatorTypes,
    SDKStateEnum,
    States,
    Transitions
} = require('./common');

const { TransferState } = Enum.Transfers;

/**
 *  Models the state machine and operations required for performing an outbound transfer
 */
class OutboundTransfersModel {
    constructor(config) {
        this._idGenerator = idGenerator(config.idGenerator);
        this._cache = config.cache;
        this._logger = config.logger.push({ component: this.constructor.name });
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
        this._mojaloopSharedAgents = config.mojaloopSharedAgents;
        this._multiplePartiesResponseSeconds = config.multiplePartiesResponseSeconds;
        this._sendFinalNotificationIfRequested = config.sendFinalNotificationIfRequested;
        this._apiType = config.apiType;
        this._supportedCurrencies = config.supportedCurrencies;
        this._traceFlags = config.traceFlags;

        if (this._autoAcceptParty && this._multiplePartiesResponse) {
            throw new Error('Conflicting config options provided: autoAcceptParty and multiplePartiesResponse');
        }

        this._cacheTtl = config.redisCacheTtl;

        const mojaloopRequestsConfig = {
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            transactionRequestsEndpoint: config.transactionRequestsEndpoint,
            fxQuotesEndpoint: config.fxQuotesEndpoint,
            fxTransfersEndpoint: config.fxTransfersEndpoint,
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
            apiType: config.apiType,
        };

        // Add shared agents to prevent HTTPS agent recreation per request
        if (this._mojaloopSharedAgents) {
            mojaloopRequestsConfig.httpAgent = this._mojaloopSharedAgents.httpAgent;
            mojaloopRequestsConfig.httpsAgent = this._mojaloopSharedAgents.httpsAgent;
            this._logger.isDebugEnabled && this._logger.debug('Using shared HTTP/HTTPS agents for OutboundTransfersModel MojaloopRequests');
        }

        this._requests = new MojaloopRequests(mojaloopRequestsConfig);

        // default to ILP 1 unless v4 is set
        const ilpVersion = config.ilpVersion === '4' ? Ilp.ILP_VERSIONS.v4 : Ilp.ILP_VERSIONS.v1;
        this._ilp = Ilp.ilpFactory(ilpVersion, {
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
            fxQuoteRequests: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_fx_quote_request_count',
                'Count of outbound FX quote requests sent'),
            fxQuoteResponses: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_fx_quote_response_count',
                'Count of responses received to outbound FX quote requests'),
            transferPrepares: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_transfer_prepare_count',
                'Count of outbound transfer prepare requests sent'),
            transferFulfils: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_transfer_fulfil_response_count',
                'Count of responses received to outbound transfer prepares'),
            fxTransferPrepares: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_fx_transfer_prepare_count',
                'Count of outbound FX transfer prepare requests sent'),
            fxTransferFulfils: config.metricsClient.getCounter(
                'mojaloop_connector_outbound_fx_transfer_fulfil_response_count',
                'Count of responses received to outbound FX transfer prepares'),
            partyLookupLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_party_lookup_latency',
                'Time taken for a response to a party lookup request to be received'),
            quoteRequestLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_quote_request_latency',
                'Time taken for a response to a quote request to be received'),
            transferLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_transfer_latency',
                'Time taken for a response to a transfer prepare to be received'),
            fxQuoteLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_fx_quote_latency',
                'Time taken for a response to an FX quote request to be received'),
            fxTransferLatency: config.metricsClient.getHistogram(
                'mojaloop_connector_outbound_fx_transfer_latency',
                'Time taken for a response to an FX transfer to be received')
        };

        this.getServicesFxpResponse = config.getServicesFxpResponse;

        this._logger.isDebugEnabled && this._logger.push(config.outbound.tls.creds).debug('OutboundTransfersModel is created with outbound.tls.creds');
    }


    /**
     * Initializes the internal state machine object
     */
    _initStateMachine(initState) {
        this.stateMachine = new StateMachine({
            init: initState,
            transitions: [
                { name: Transitions.RESOLVE_PAYEE, from: States.START, to: States.PAYEE_RESOLVED },
                { name: Transitions.REQUEST_SERVICES_FXP, from: States.PAYEE_RESOLVED, to: States.SERVICES_FXP_RECEIVED },
                { name: Transitions.REQUEST_FX_QUOTE,
                    from:  [
                        States.QUOTE_RECEIVED, // if transfer type is 'RECEIVE'
                        States.SERVICES_FXP_RECEIVED
                    ],
                    to: States.FX_QUOTE_RECEIVED
                },
                { name: Transitions.REQUEST_QUOTE,
                    from: [
                        States.FX_QUOTE_RECEIVED,
                        States.PAYEE_RESOLVED, // if FX isn't required
                        States.SERVICES_FXP_RECEIVED, // if transfer type is 'RECEIVE'
                        States.START
                    ],
                    to: States.QUOTE_RECEIVED
                },
                { name: Transitions.EXECUTE_FX_TRANSFER,
                    from: [
                        States.QUOTE_RECEIVED,
                        States.FX_QUOTE_RECEIVED,
                    ],
                    to: States.FX_TRANSFER_SUCCEEDED
                },
                { name: Transitions.EXECUTE_TRANSFER,
                    from: [
                        States.FX_TRANSFER_SUCCEEDED,
                        States.QUOTE_RECEIVED, // if FX isn't required
                    ],
                    to: States.SUCCEEDED
                },
                { name: Transitions.GET_TRANSFER, to: States.SUCCEEDED },
                { name: Transitions.ERROR, from: '*', to: States.ERRORED },
                { name: Transitions.ABORT, from: '*', to: States.ABORTED },
            ],
            methods: {
                onTransition: this._handleTransition.bind(this),
                onAfterTransition: this._afterTransition.bind(this),
                onPendingTransition: (transition, from, to) => {
                    // allow transitions to 'error' state while other transitions are in progress
                    if (transition !== Transitions.ERROR) {
                        throw new Error(`Transition requested while another transition is in progress: ${transition} from: ${from} to: ${to}`);
                    }
                },
                onInvalidTransition: (transition, from, to) => {
                    this._logger.push({ transition, from, to }).error('Invalid transition!');
                    throw new Error(`Invalid transition: ${transition} from: ${from} to: ${to}`);
                }
            }
        });

        return this.stateMachine[initState];
    }


    /**
     * Updates the internal state representation to reflect that of the state machine itself
     */
    _afterTransition() {
        this._logger.isVerboseEnabled && this._logger.verbose(`State machine transitioned: ${this.data.currentState} -> ${this.stateMachine.state} for transfer ${this.data.transferId}`);
        this.data.currentState = this.stateMachine.state;
    }


    /**
     * Initializes the transfer model
     *
     * @param data {object} - The inbound API POST /transfers request body
     */
    async initialize(data, { traceparent, baggage} = {}) {
        this.data = data;

        if (traceparent) {
            this._traceFlags = traceparent.split('-').pop();
            this.data.traceId = traceparent.split('-')[1];
        }

        this._baggage = baggage;

        // add a transferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('transferId')) {
            this.data.transferId = this._idGenerator();
            this.#generateTraceId();
        }

        // initialize the transfer state machine to its starting state
        if(!this.data.hasOwnProperty('currentState')) {
            this.data.currentState = States.START;
        }

        if(!this.data.hasOwnProperty('initiatedTimestamp')) {
            this.data.initiatedTimestamp = new Date().toISOString();
        }

        if(!this.data.hasOwnProperty('direction')) {
            this.data.direction = Directions.OUTBOUND;
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
        this._logger.isInfoEnabled && this._logger.info(`Transfer ${this.data.transferId} is transitioning from ${lifecycle.from} to ${lifecycle.to} in response to ${lifecycle.transition}`);

        switch (lifecycle.transition) {
            case 'init':
                // init, just allow the fsm to start
                return;

            case Transitions.RESOLVE_PAYEE:
                if (this._multiplePartiesResponse) {
                    return this._resolveBatchPayees();
                }
                return this._resolvePayee();

            case Transitions.REQUEST_SERVICES_FXP:
                return this._requestServicesFxp();

            case Transitions.REQUEST_FX_QUOTE:
                return this._requestFxQuote();

            case Transitions.REQUEST_QUOTE:
                return this._requestQuote();

            case Transitions.EXECUTE_FX_TRANSFER:
                return this._executeFxTransfer();

            case Transitions.EXECUTE_TRANSFER:
                // prepare a transfer and wait for fulfillment
                return this._executeTransfer();

            case Transitions.ABORT:
                this._logger.isWarnEnabled && this._logger.push({ args }).warn('State machine is aborting transfer');
                this.data.abortedReason = args[0];
                break;

            case Transitions.ERROR:
                this._logger.isWarnEnabled && this._logger.push({ args }).warn('State machine is erroring with error: ');
                this.data.lastError = args[0] || new Error('unspecified error');
                break;

            case Transitions.GET_TRANSFER:
                return this._getTransfer();

            default:
                throw new Error(`Unhandled state transition for transfer ${this.data.transferId}: ${safeStringify(args)}`);
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

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /parties request to the switch
            try {
                const channel = payeeKey;
                const subscribing = this._cache.subscribeToOneMessageWithTimerNew(channel, this._requestProcessingTimeoutSeconds);

                latencyTimerDone = this.metrics.partyLookupLatency.startTimer();
                const res = await this._requests.getParties(
                    this.data.to.idType,
                    this.data.to.idValue,
                    this.data.to.idSubValue,
                    this.data.to.fspId,
                    this.#createOtelHeaders()
                );

                this.data.getPartiesRequest = res.originalRequest;

                this.metrics.partyLookupRequests.inc();
                this._logger.push({ peer: res }).debug('Party lookup sent to peer');

                const message = await subscribing;

                if(latencyTimerDone) {
                    latencyTimerDone();
                }
                this.metrics.partyLookupResponses.inc();

                this.data.getPartiesResponse = message;
                if (this.data.getPartiesResponse.body?.errorInformation) {
                    // this is an error response to our GET /parties request
                    const err = new BackendError(`Got an error response resolving party: ${safeStringify(this.data.getPartiesResponse.body, { depth: Infinity })}`, 500);
                    err.mojaloopError = this.data.getPartiesResponse.body;
                    return reject(err);
                }
                let payee = this.data.getPartiesResponse.body;

                if(!payee.party) {
                    // we should never get a non-error response without a party, but just in case...
                    return reject(new Error(`Resolved payee has no party object: ${safeStringify(payee)}`));
                }

                payee = payee.party;

                this._logger.push({ payee }).verbose('Payee resolved');

                // check we got the right payee and info we need
                if(payee.partyIdInfo.partyIdType !== this.data.to.idType) {
                    const err = new Error(`Expecting resolved payee party IdType to be ${this.data.to.idType} but got ${payee.partyIdInfo.partyIdType}`);
                    return reject(err);
                }

                if(payee.partyIdInfo.partyIdentifier !== this.data.to.idValue) {
                    const err = new Error(`Expecting resolved payee party identifier to be ${this.data.to.idValue} but got ${payee.partyIdInfo.partyIdentifier}`);
                    return reject(err);
                }

                // TODO: Disabling this check because of an issue in the ISO transformation in the ml-schema-transformer-lib in subId handling
                // We need to re-enable this check once that issue is fixed
                // if(payee.partyIdInfo.partySubIdOrType !== this.data.to.idSubValue) {
                //     const err = new Error(`Expecting resolved payee party subTypeId to be ${this.data.to.idSubValue} but got ${payee.partyIdInfo.partySubIdOrType}`);
                //     return reject(err);
                // }

                if(!payee.partyIdInfo.fspId) {
                    const err = new Error(`Expecting resolved payee party to have an FSPID: ${safeStringify(payee.partyIdInfo)}`);
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

                if (Array.isArray(payee.supportedCurrencies)) {
                    if (!payee.supportedCurrencies.length) {
                        throw new Error(ErrorMessages.noSupportedCurrencies);
                    }

                    this.data.needFx = this._isFxNeeded(this._supportedCurrencies, payee.supportedCurrencies, this.data.currency, this.data.amountType);
                    this.data.supportedCurrencies = payee.supportedCurrencies;
                }

                this._logger.push({
                    transferId: this.data.transferId,
                    homeTransactionId: this.data.homeTransactionId,
                    needFx: this.data.needFx,
                }).verbose('Payee validation passed');

                return resolve(payee);
            }
            catch(err) {
                this._logger.error(`Error in resolvePayee ${payeeKey}:`, err);
                // If type of error is BackendError, it will be handled by the state machine
                if (err instanceof BackendError) {
                    this.data.lastError = err;
                    return reject(err);
                }
                // Check if the error is a TimeoutError, and if so, reject with a BackendError
                if (err instanceof TimeoutError) {
                    const error = new BackendError(`Timeout resolving payee for transfer ${this.data.transferId}`, 504);
                    this.data.lastError = error;
                    return reject(error);
                }
                // otherwise, just throw a generic error
                const error = new BackendError(`Error resolving payee for transfer ${this.data.transferId}: ${err.message}`, 500);
                this.data.lastError = error;
                return reject(error);
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
                    const err = new BackendError(`Got an error response resolving party: ${safeStringify(this.data.getPartiesResponse.body, { depth: Infinity })}`, 500);
                    err.mojaloopError = this.data.getPartiesResponse.body;
                    throw err;
                }
                let payee = this.data.getPartiesResponse.body;

                if(!payee.party) {
                    // we should never get a non-error response without a party, but just in case...
                    // cancel the timeout handler
                    throw new Error(`Resolved payee has no party object: ${safeStringify(payee)}`);
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
                    throw new Error(`Expecting resolved payee party to have an FSPID: ${safeStringify(payee.partyIdInfo)}`);
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
                this._logger.isDebugEnabled && this._logger.push({ payeeList }).debug('Payees resolved');
                this.data.to = payeeList.map(payeeResolver);
                resolve();
            }, this._multiplePartiesResponseSeconds * 1000);
            // now we have a timeout handler we can fire off
            // a GET /parties request to the switch
            try {
                latencyTimerDone = this.metrics.partyLookupLatency.startTimer();
                const res = await this._requests.getParties(
                    this.data.to.idType,
                    this.data.to.idValue,
                    this.data.to.idSubValue,
                    undefined,
                    this.#createOtelHeaders()
                );
                this.data.getPartiesRequest = res.originalRequest;
                this.metrics.partyLookupRequests.inc();
                this._logger.isErrorEnabled && this._logger.push({ peer: res }).error('Party lookup sent to peer');
            }
            catch(err) {
                // cancel the timer before rejecting the promise
                clearTimeout(timer);
                return reject(err);
            }
        });
    }

    async _requestServicesFxp() {
        this.data.fxProviders = this.getServicesFxpResponse;
        this._logger.isInfoEnabled && this._logger.push(this.data.fxProviders).info('servicesFxp configured response');

        if (!this.data.fxProviders?.length) {
            throw new Error(ErrorMessages.noFxProviderDetected);
        }
        return this.data.fxProviders;
    }

    async _requestFxQuote() {
        let latencyTimerDone;
        try {
            this.data.fxQuoteExpiration = this._getExpirationTimestamp();
            const payload = dto.outboundPostFxQuotePayloadDto(this.data);
            const channel = `${CacheKeyPrefixes.FX_QUOTE_CALLBACK_CHANNEL}_${payload.conversionRequestId}`;

            latencyTimerDone = this.metrics.fxQuoteLatency.startTimer();
            const subscribing = this._cache.subscribeToOneMessageWithTimer(channel);

            const resp = await this._requests.postFxQuotes(
                payload,
                payload.conversionTerms.counterPartyFsp,
                this.#createOtelHeaders()
            );

            const { originalRequest } = resp;
            // Setting the fxQuoteRequest to have the fspiop payload
            // If ISO20022 is required then use originalRequest
            this.data.fxQuoteRequest = {
                body: payload,
                headers: originalRequest.headers
            };
            this.metrics.fxQuoteRequests.inc();
            this._logger.isVerboseEnabled && this._logger.push({ fxQuotePayload: payload }).verbose('fxQuote request is sent to hub');

            const message = await subscribing;

            if (latencyTimerDone) {
                latencyTimerDone();
            }
            this.metrics.fxQuoteResponses.inc();

            if (message instanceof Error) throw message;
            const { body, headers } = message.data;

            if (!message.success) {
                const error = new BackendError(`Got an error response requesting fxQuote: ${safeStringify(body)}`, 500);
                error.mojaloopError = body;
                throw error;
            }

            // this._logger.push({ body, originalRequest }).verbose('fxQuote callback response received');

            if (this._rejectExpiredQuoteResponses) {
                const now = new Date().toISOString();
                if (now > this.data.fxQuoteExpiration) {
                    const errMessage = `${ErrorMessages.responseMissedExpiryDeadline} (fxQuote)`;
                    this._logger.warn(`${errMessage}: system time=${now} > expiration time=${this.data.fxQuoteExpiration}`);
                    throw new BackendError(errMessage, 504);
                }
            }

            this.data.fxQuoteResponse = {
                body,
                headers,
            };
            this.data.fxQuoteResponseSource = headers['fspiop-source'];

            return payload; // think, if we need to return something at this point
        } catch (err) {
            if (latencyTimerDone) {
                latencyTimerDone();
            }
            this._logger.push({ err }).error(`error in _requestFxQuote: ${err.message}`);
            throw err;
        }
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
            // think, if we need to add converter field

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
                                this._logger.isErrorEnabled && this._logger.error(`${msg}: system time=${now} > expiration time=${quote.expiration}`);
                            }
                        }
                    } else if (message.type === 'quoteResponseError') {
                        error = new BackendError(`Got an error response requesting quote: ${safeStringify(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    }
                    else {
                        this._logger.isVerboseEnabled && this._logger.push({ quoteKey, message }).verbose(`Ignoring cache notification for quote ${quoteKey}. Unknown message type ${message.type}.`);
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
                    // originalIso20022QuoteResponse is being sent as post transfers payload to hub
                    // Can't remove this at the moment
                    this.data.quoteResponse = {
                        headers: message.data.headers,
                        body: message.data.body,
                        originalIso20022QuoteResponse: message.data.originalIso20022QuoteResponse,
                    };
                    this._logger.isVerboseEnabled && this._logger.push({ quoteResponse: this.data.quoteResponse.body }).verbose('Quote response received');

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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${quoteKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
                const res = await this._requests.postQuotes(quote, this.data.to.fspId, this.#createOtelHeaders());

                this.data.quoteRequest = {
                    body: quote,
                    headers: res.originalRequest.headers
                };

                this.metrics.quoteRequests.inc();
                this._logger.isDebugEnabled && this._logger.push({ res }).debug('Quote request sent to peer');
            }
            catch (err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(quoteKey, subId).catch(e => {
                    this._logger.isWarnEnabled && this._logger.warn(`Error unsubscribing (in error handler) ${quoteKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
        const quote = {
            quoteId: this._idGenerator(),
            transactionId: this.data.transferId,
            amountType: this.data.amountType,
            amount: this.defineQuoteAmount(),
            expiration: this._getExpirationTimestamp()
        };

        quote.payer = shared.internalPartyToMojaloopParty(this.data.from, this._dfspId);
        quote.payee = shared.internalPartyToMojaloopParty(this.data.to, this.data.to.fspId);

        quote.transactionType = {
            scenario: this.data.transactionType,
            subScenario: this.data.subScenario,
            // TODO: support payee initiated txns?
            initiator: Initiator.PAYER,
            // TODO: defaulting to CONSUMER initiator type should
            // be replaced with a required element on the incoming
            // API request
            initiatorType: this.data.from.type || InitiatorTypes.CONSUMER
        };

        // geocode
        // note
        if (this.data.note) {
            quote.note = this.data.note;
        }

        // add extensionList if provided
        if (this.data.quoteRequestExtensions?.length) {
            quote.extensionList = {
                extension: this.data.quoteRequestExtensions
            };
        }

        // TODO: re-enable this after updating quoting service
        // if (this.data.needFx) {
        //     quote.converter = CurrencyConverters.PAYER;
        // }
        this._logger.isDebugEnabled && this._logger.push({ quote }).debug('quote request payload is ready');

        return quote;
    }

    defineQuoteAmount() {
        if (this.data.needFx && this.data.fxQuoteResponse) { // transfer type 'SEND'
            return this.data.fxQuoteResponse.body.conversionTerms.targetAmount;
        }
        const { currency, amount } = this.data;
        return {
            currency,
            amount
        };
    }


    async _executeFxTransfer() {
        let latencyTimerDone;
        try {
            this.data.fxTransferExpiration = this._getExpirationTimestamp();
            const payload = dto.outboundPostFxTransferPayloadDto(this.data);
            const channel = `${CacheKeyPrefixes.FX_TRANSFER_CALLBACK_CHANNEL}_${payload.commitRequestId}`;

            latencyTimerDone = this.metrics.fxTransferLatency.startTimer();
            const subscribing = this._cache.subscribeToOneMessageWithTimer(channel);

            const { originalRequest } = await this._requests.postFxTransfers(payload, payload.counterPartyFsp, this.#createOtelHeaders());
            this.data.fxTransferRequest = { body: payload , headers: originalRequest.headers };
            this.metrics.fxTransferPrepares.inc();
            this._logger.push({ originalRequest }).verbose('fxTransfers request is sent to hub');

            const message = await subscribing;

            if (latencyTimerDone) {
                latencyTimerDone();
            }
            this.metrics.fxTransferFulfils.inc();
            if (message instanceof Error) throw message;

            const { body, headers } = message.data;

            if (!message.success) {
                const error = new BackendError(`Got an error response requesting fxTransfers: ${safeStringify(body)}`, 500);
                error.mojaloopError = body;
                throw error;
            }
            this._logger.push({ body }).verbose('fxTransfers fulfil response received');
            if (this._rejectExpiredTransferFulfils) {
                const now = new Date().toISOString();
                if (now > this.data.fxTransferExpiration) {
                    const errMessage = `${ErrorMessages.responseMissedExpiryDeadline} (fxTransfers fulfil)`;
                    this._logger.warn(`${errMessage}: system time=${now} > expiration time=${this.data.fxTransferExpiration}`);
                    throw new BackendError(errMessage, 504);
                }
            }

            if (this._checkIlp && !this._ilp.validateFulfil(body.fulfilment, this.data.fxQuoteResponse.body.condition)) {
                throw new Error(ErrorMessages.invalidFulfilment);
            }

            this.data.fxTransferResponse = {
                body,
                headers,
            };

            return payload; // think, if we need to return something at this point
        } catch (err) {
            if (latencyTimerDone) {
                latencyTimerDone();
            }
            this._logger.push({ err }).error(`error in _executeFxTransfer: ${err.message}`);
            throw err;
        }
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
                                this._logger.isErrorEnabled && this._logger.error(`${msg}: system time=${now} > expiration=${prepare.expiration}`);
                                error = new BackendError(msg, 504);
                            }
                        }
                    } else if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response preparing transfer: ${safeStringify(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    } else {
                        this._logger.isVerboseEnabled && this._logger.push({ message }).verbose(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
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
                    this._logger.isInfoEnabled && this._logger.push({ fulfil: fulfil.body }).info('Transfer fulfil received');
                    this.data.fulfil = fulfil;
                    if(this._checkIlp && !this._ilp.validateFulfil(fulfil.body.fulfilment, this.data.quoteResponse.body.condition)) {
                        throw new Error('Invalid fulfilment received from peer DFSP.');
                    }
                    if(this._sendFinalNotificationIfRequested && fulfil.body.transferState === TransferState.RESERVED) {
                        // we need to send a PATCH notification back to say we have committed the transfer.
                        // Note that this is normally a switch only responsibility but the capability is
                        // implemented here to support testing use cases where the mojaloop-connector is
                        // acting in a peer-to-peer scenario and it is desirable for the other peer to
                        // receive this notification.
                        // Note that the transfer is considered committed as far as this (payer) side is concerned
                        // we will use the current server time as committed timestamp.
                        const patchNotification = {
                            completedTimestamp: (new Date()).toISOString(),
                            transferState: TransferState.COMMITTED,
                        };
                        const res = this._requests.patchTransfers(
                            this.data.transferId,
                            patchNotification,
                            this.data.quoteResponseSource,
                            this.#createOtelHeaders()
                        );
                        this.data.patch = res.originalRequest;
                        this._logger.isInfoEnabled && this._logger.info(`PATCH final notification sent to peer for transfer ${this.data.transferId}`);
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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
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
                const headers = this.#createOtelHeaders();

                let res;
                if (this._apiType  === API_TYPES.iso20022) {
                    // Pass in quote request as context if needed for ISO20022 message generation
                    res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource, headers, {
                        isoPostQuoteResponse: this.data.quoteResponse.originalIso20022QuoteResponse
                    });
                } else {
                    res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource, headers, {});
                }

                this.data.prepare = {
                    body: prepare,
                    headers: res.originalRequest.headers
                };

                this.metrics.transferPrepares.inc();
                this._logger.isVerboseEnabled && this._logger.push({ prepare, res }).verbose('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timeout and unsubscribe before rejecting the promise
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
                        error = new BackendError(`Got an error response retrieving transfer: ${safeStringify(message.data.body, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data.body;
                    } else if (message.type !== 'transferFulfil') {
                        this._logger.isVerboseEnabled && this._logger.push({ message }).verbose(`Ignoring cache notification for transfer ${transferKey}. Unknown message type ${message.type}.`);
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
                    this._logger.isVerboseEnabled && this._logger.push({ fulfil: fulfil.body }).verbose('Transfer fulfil received');
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
                    this._logger.isErrorEnabled && this._logger.error(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || safeStringify(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /transfers request to the switch
            try {
                const res = await this._requests.getTransfers(this.data.transferId, undefined, this.#createOtelHeaders());
                this._logger.isVerboseEnabled && this._logger.push({ peer: res }).verbose(`getTransfers ${this.data.transferId} sent to peer`);
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

        if (this._apiType  === API_TYPES.iso20022) {
            // Append keys from quoteResponse extensionList with specific prefixes
            const quoteResponseExtensions = this.data.quoteResponse.body.extensionList?.extension;
            if (quoteResponseExtensions) {
                const prefixes = [
                    'CdtTrfTxInf.Cdtr.',
                    'CdtTrfTxInf.CdtrAcct.',
                    'CdtTrfTxInf.CdtrAgt.',
                    'CdtTrfTxInf.InstrForCdtrAgt.',
                    'CdtTrfTxInf.InstrForNxtAgt.'
                ];
                const filteredExtensions = quoteResponseExtensions.filter(ext =>
                    prefixes.some(prefix => ext.key.startsWith(prefix))
                );
                if (filteredExtensions.length > 0) {
                    if (!prepare.extensionList) {
                        prepare.extensionList = { extension: [] };
                    }
                    prepare.extensionList.extension.push(...filteredExtensions);
                }
            }
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

        switch (this.data.currentState) {
            case States.PAYEE_RESOLVED:
                resp.currentState = SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE;
                break;

            case States.FX_QUOTE_RECEIVED:
                resp.currentState = SDKStateEnum.WAITING_FOR_CONVERSION_ACCEPTANCE;
                break;

            case States.QUOTE_RECEIVED:
                resp.currentState = SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case States.SUCCEEDED:
                resp.currentState = SDKStateEnum.COMPLETED;
                break;

            case States.ABORTED:
                resp.currentState = SDKStateEnum.ABORTED;
                break;

            case States.ERRORED:
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
            const res = await this._cache.set(`transferModel_out_${this.data.transferId}`, this.data, this._cacheTtl);
            // function to modify this.data before saving to cache for UI.
            const modifiedData = this._modifyDataForUi(this.data);
            // save to a UI key, using a modifiedData, as we don't want any side effects to happen on original data
            // No ttl set as it will persist throughout the session
            await this._cache.set(`transferUI_out_${this.data.transferId}`, modifiedData);
            this._logger.isDebugEnabled && this._logger.push({ res }).debug('Persisted transfer model in cache');
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, data: this.data }).error('Error saving transfer model');
            throw err;
        }
    }

    /**
     * Modifies the data being stored in the cache for UI before it is stored.
     * Works on a copy of original object to avoid side effects
     */
    _modifyDataForUi(data) {
        // deep cloning to avoid side effects
        let modifiedData = JSON.parse(JSON.stringify(data));
        // Removing iso quote response and extension lists
        if(modifiedData.getPartiesResponse && modifiedData.getPartiesResponse.body && modifiedData.getPartiesResponse.body.extensionList)
            modifiedData.getPartiesResponse.body.extensionList = undefined;
        if(modifiedData.fxQuoteResponse && modifiedData.fxQuoteResponse.body && modifiedData.fxQuoteResponse.body.extensionList)
            modifiedData.fxQuoteResponse.body.extensionList = undefined;
        if(modifiedData.quoteResponse && modifiedData.quoteResponse.originalIso20022QuoteResponse){
            modifiedData.quoteResponse.originalIso20022QuoteResponse = undefined;
        }
        if(modifiedData.quoteResponse && modifiedData.quoteResponse.body && modifiedData.quoteResponse.body.extensionList){
            modifiedData.quoteResponse.body.extensionList = undefined;
        }
        if(modifiedData.fxTransferResponse && modifiedData.fxTransferResponse.body && modifiedData.fxTransferResponse.body.extensionList){
            modifiedData.fxTransferResponse.body.extensionList = undefined;
        }
        if(modifiedData.fulfil && modifiedData.fulfil.body && modifiedData.fulfil.body.extensionList){
            modifiedData.fulfil.body.extensionList = undefined;
        }
        return modifiedData;
    }

    /**
     * Determines if FX is needed for the transfer
     *
     * @param {Array} payerCurrencies - Array of supported currencies for the payer
     * @param {Array} payeeCurrencies - Array of supported currencies for the payee
     * @param {string} amountCurrency - Currency of the amount being transferred
     * @param {string} amountType - Type of the amount being transferred (SEND/RECEIVE)
     * @returns {boolean} - true if FX is needed, false if not
     */
    _isFxNeeded(payerCurrencies, payeeCurrencies, amountCurrency, amountType) {
        if (payerCurrencies.includes(amountCurrency) && payeeCurrencies.includes(amountCurrency)) {
            return false;
        }
        const intersection = payerCurrencies.filter(currency => payeeCurrencies.includes(currency));
        if(intersection.length > 0 && !intersection.includes(amountCurrency)) {
            return true;
        }
        if (amountType === AmountTypes.RECEIVE) {
            if (!payerCurrencies.includes(amountCurrency)) {
                return true;
            }
        }
        if (!payeeCurrencies.includes(amountCurrency)) {
            return true;
        }

        return false;
    }

    /**
     * Loads a transfer model from cache for resumption of the transfer process
     *
     * @param transferId {string} - UUID transferId of the model to load from cache
     */
    async load(transferId, headers) {
        try {
            const data = await this._cache.get(`transferModel_out_${transferId}`);

            if(!data) {
                throw new Error(`No cached data found for transferId: ${transferId}`);
            }
            await this.initialize(data, headers);
            this._logger.isDebugEnabled && this._logger.push({ cache: this.data }).debug('Transfer model loaded from cached state');
        }
        catch (err) {
            this._logger.isWarnEnabled && this._logger.push({ err }).warn('Error loading transfer model');
            throw err;
        }
    }


    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     *
     * @param mergeData {object} - an object to merge with the model state (data) before running the state machine
     */
    async run(mergeData = null) {
        const log = this._logger.push({ transferId: this.data?.transferId });

        try {
            // if we were passed a mergeData object...
            // merge it with our existing state, overwriting any existing matching root level keys
            if (mergeData) {
                // first remove any merge keys that we do not want to allow to be changed
                // note that we could do this in the swagger also. this is to put a responsibility
                // on this model to defend itself.
                const permittedMergeKeys = ['acceptParty', 'acceptConversion', 'acceptQuote', 'acceptQuoteOrConversion', 'amount', 'to'];
                Object.keys(mergeData).forEach(k => {
                    if(permittedMergeKeys.indexOf(k) === -1) {
                        delete mergeData[k]; // try to avoid mutation of parameters
                    }
                });
                this.data = {
                    ...this.data,
                    ...mergeData,
                };
            }

            // run transitions based on incoming state
            switch (this.data.currentState) {
                case States.START:
                    // first transition is to resolvePayee

                    if (typeof(this.data.to.fspId) !== 'undefined' && this.data.skipPartyLookup) {
                        // we already have the payee DFSP and we have bee asked to skip party resolution
                        log.isInfoEnabled && log.info('Skipping payee resolution for transfer as to.fspId was provided and skipPartyLookup is truthy');
                        this.data.currentState = States.PAYEE_RESOLVED;
                        // (!) this.data.currentState and this.stateMachine.state are different now!
                        break;
                    }

                    // next transition is to resolvePayee
                    await this.stateMachine.resolvePayee();
                    log.isInfoEnabled && log.info('Payee resolved for transfer');

                    if (this.stateMachine.state === States.PAYEE_RESOLVED && !this._autoAcceptParty) {
                        log.isInfoEnabled && log.info('Transfer waits for async acceptParty');
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case States.PAYEE_RESOLVED:
                    if (!this._autoAcceptParty && !this.data.acceptParty && !this.data.skipPartyLookup) {
                        // resuming after a party resolution halt, backend did not accept the party.
                        const abortMessage = 'Payee rejected by backend';
                        log.isInfoEnabled && log.info(abortMessage);
                        await this.stateMachine.abort(abortMessage);
                        await this._save();
                        return this.getResponse();
                    }

                    if (this.data.needFx) {
                        await this.stateMachine.requestServicesFxp();
                        log.isInfoEnabled && log.info('Services FXP received for transfer');
                    } else {
                        await this.stateMachine.requestQuote();
                        log.isInfoEnabled && log.info('Quote received for transfer');
                        if (this.stateMachine.state === States.QUOTE_RECEIVED && !this._autoAcceptQuotes) {
                            //we break execution here and return the quote response details to allow asynchronous accept or reject
                            //of the quote
                            log.isInfoEnabled && log.info('Transfer waits for async accept or reject of quotes');
                            await this._save();
                            return this.getResponse();
                        }
                    }
                    break;

                case States.SERVICES_FXP_RECEIVED: {
                    const transition = this.data.amountType === AmountTypes.SEND
                        ? Transitions.REQUEST_FX_QUOTE
                        : Transitions.REQUEST_QUOTE;

                    await this.stateMachine[transition]();
                    log.isInfoEnabled && log.info(`Transition ${transition} for transfer has been completed`);

                    if ([States.QUOTE_RECEIVED, States.FX_QUOTE_RECEIVED].includes(this.stateMachine.state)) {
                        //we break execution here and return the quotes/fxQuote response details to allow asynchronous accept or reject
                        log.isInfoEnabled && log.info(`Transfer waits for async accept or reject of ${transition}`);
                        await this._save();
                        return this.getResponse();
                    }
                    break;
                }

                case States.FX_QUOTE_RECEIVED: {
                    if ((this.data.acceptConversion !== undefined && this.data.acceptConversion === false) ||
                        (this.data.acceptQuoteOrConversion !== undefined && this.data.acceptQuoteOrConversion === false) ||
                        (this.data.acceptConversion === undefined && this.data.acceptQuoteOrConversion === undefined)) {
                        const abortMessage = ErrorMessages.fxQuoteRejectedByBackend;
                        log.isInfoEnabled && log.info(abortMessage);
                        await this.stateMachine.abort(abortMessage);
                        await this._save();
                        return this.getResponse();
                    }

                    const transition = this.data.amountType === AmountTypes.SEND
                        ? Transitions.REQUEST_QUOTE
                        : Transitions.EXECUTE_FX_TRANSFER;

                    await this.stateMachine[transition]();
                    log.isInfoEnabled && log.info(`Transition ${transition} for transfer is done`);

                    if (this.stateMachine.state === States.QUOTE_RECEIVED && !this._autoAcceptQuotes) {
                        log.isInfoEnabled && log.info('Transfer waits for async acceptQuotes');
                        await this._save();
                        return this.getResponse();
                    }
                    break;
                }

                case States.QUOTE_RECEIVED: {
                    if (!this._autoAcceptQuotes &&
                        ((this.data.acceptQuote !== undefined && this.data.acceptQuote === false) ||
                        (this.data.acceptQuoteOrConversion !== undefined && this.data.acceptQuoteOrConversion === false) ||
                        (this.data.acceptQuote === undefined && this.data.acceptQuoteOrConversion === undefined))) {
                        // resuming after a party resolution halt, backend did not accept the party.
                        const abortMessage = ErrorMessages.quoteRejectedByBackend;
                        log.isInfoEnabled && log.info(abortMessage);
                        await this.stateMachine.abort(abortMessage);
                        await this._save();
                        return this.getResponse();
                    }

                    const transition = !this.data.needFx
                        ? Transitions.EXECUTE_TRANSFER
                        : (this.data.amountType === AmountTypes.SEND
                            ? Transitions.EXECUTE_FX_TRANSFER
                            : Transitions.REQUEST_FX_QUOTE);

                    await this.stateMachine[transition]();
                    log.isInfoEnabled && log.info(`Transition ${transition} for transfer has been completed`);

                    if (this.stateMachine.state === States.FX_QUOTE_RECEIVED) { // todo: think, if we need to add _autoAcceptConversion
                        log.isInfoEnabled && log.info('Transfer waits for async acceptConversion');
                        await this._save();
                        return this.getResponse();
                    }
                    break;
                }

                case States.FX_TRANSFER_SUCCEEDED:
                    await this.stateMachine.executeTransfer();
                    log.isInfoEnabled && log.info('FxTransfer has been completed');
                    break;

                case States.SUCCEEDED:
                    // all steps complete so return
                    log.isInfoEnabled && log.info('Transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case States.ERRORED:
                    // stopped in errored state
                    await this._save();
                    log.isErrorEnabled && log.error('State machine in errored state');
                    return;

                case States.ABORTED:
                    // stopped in aborted state
                    log.isWarnEnabled && log.warn('State machine in aborted state');
                    await this._save();
                    return this.getResponse();

                    // todo: no such state!
                case 'getTransfer':
                    await this.stateMachine.getTransfer();
                    log.isInfoEnabled && log.info('getTransfer has been completed');
                    break;

                default:
                    // The state is not handled here, throwing an error to avoid an infinite recursion of this function
                    await this._save();
                    log.isErrorEnabled && log.error(`State machine in unhandled state: ${this.data.currentState}`);
                    return;
            }

            // now call ourselves recursively to deal with the next transition
            log.isVerboseEnabled && log.verbose(`Transfer model state machine transition completed in state: ${this.stateMachine.state}. Recursing to handle next transition.`);
            return this.run();
        } catch (err) {
            log.error('error running outbound transfer model: ', err);

            // as this function is recursive, we dont want to error the state machine multiple times
            if (this.data.currentState !== States.ERRORED) {
                // err should not have a transferState property here!
                if (err.transferState) {
                    log.isWarnEnabled && log.warn(`State machine is broken: ${safeStringify(err)}`);
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

    #generateTraceId() {
        // todo: add possibility to generate traceId based on transferId
        this.data.traceId ||= randomBytes(16).toString('hex');
        const { traceId, transferId } = this.data;
        this._logger.isInfoEnabled && this._logger.push({ traceId, transferId }).info('traceId is generated');
        return traceId;
    }

    #createOtelHeaders() {
        return Object.freeze({
            traceparent: generateTraceparent(this.data.traceId, this._traceFlags),
            ...this._baggage && { baggage: this._baggage },
        });
    }
}

module.exports = OutboundTransfersModel;
