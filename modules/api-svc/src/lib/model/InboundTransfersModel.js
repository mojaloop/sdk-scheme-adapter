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
const { MojaloopRequests, Ilp, Errors } = require('@mojaloop/sdk-standard-components');
const FSPIOPTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.TransferState;
const FSPIOPBulkTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.BulkTransferState;

const dto = require('../dto');
const shared = require('./lib/shared');
const { BackendRequests, HTTPResponseError } = require('./lib/requests');
const { SDKStateEnum, CacheKeyPrefixes } = require('./common');

const TRACESTATE_KEY_CALLBACK_START_TS = 'tx_callback_start_ts';

/**
 *  Models the operations required for performing inbound transfers
 */
class InboundTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger.push({ component: this.constructor.name });
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectTransfersOnExpiredQuotes = config.rejectTransfersOnExpiredQuotes;
        this._allowTransferWithoutQuote = config.allowTransferWithoutQuote;
        this._reserveNotification = config.reserveNotification;
        this._allowDifferentTransferTransactionId = config.allowDifferentTransferTransactionId;
        this._supportedCurrencies = config.supportedCurrencies;

        this.metrics = {
            quoteRequests: config.metricsClient.getCounter(
                'mojaloop_connector_inbound_quote_request_count',
                'Count of inbound quote requests sent'),
            transferPrepares: config.metricsClient.getCounter(
                'mojaloop_connector_inbound_transfer_prepare_count',
                'Count of inbound transfer prepare requests received'),
            
        };
        console.log('[DEBUG] Metrics initialized:', this.metrics);

        this._mojaloopRequests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            bulkTransfersEndpoint: config.bulkTransfersEndpoint,
            transactionRequestsEndpoint: config.transactionRequestsEndpoint,
            bulkQuotesEndpoint: config.bulkQuotesEndpoint,
            fxQuotesEndpoint: config.fxQuotesEndpoint,
            fxTransfersEndpoint: config.fxTransfersEndpoint,
            dfspId: config.dfspId,
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2: config.wso2,
            resourceVersions: config.resourceVersions,
            apiType: config.apiType,
        });

        this._backendRequests = new BackendRequests({
            logger: this._logger,
            backendEndpoint: config.backendEndpoint,
            dfspId: config.dfspId
        });

        this._checkIlp = config.checkIlp;

        const ilpVersion = config.ilpVersion === '4' ? Ilp.ILP_VERSIONS.v4 : Ilp.ILP_VERSIONS.v1;
        this._ilp = Ilp.ilpFactory(ilpVersion, {
            secret: config.ilpSecret,
            logger: config.logger,
        });
        this._cacheTtl = config.redisCacheTtl;
    }

    updateStateWithError(err) {
        this.data.lastError = err;
        this.data.currentState = SDKStateEnum.ERROR_OCCURRED;
        return this.data.transferId // if no transferId - we are in fxQuote flow
            ? this._save()
            : this.saveFxState();
    }

    /**
     * Queries the backend API for the specified party and makes a callback to the originator with the result
     */
    async getAuthorizations(transactionRequestId, sourceFspId) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this._backendRequests.getOTP(transactionRequestId, sourceFspId);

            if(!response) {
                return 'No response from backend';
            }

            // project our internal otp representation into a mojaloop authorization response body
            const mlAuthorization = {
                authenticationInfo : {
                    authentication: 'OTP',
                    authenticationValue: `${response.otpValue}`
                },
                responseType: 'ENTERED'
            };
            // make a callback to the source fsp with the party info
            return this._mojaloopRequests.putAuthorizations(transactionRequestId, mlAuthorization, sourceFspId);
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err, transactionRequestId }).error('Error in getOTP');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putAuthorizationsError(transactionRequestId, mojaloopError, sourceFspId);
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with our dfspId if found
     */
    async getParticipants(idType, idValue, idSubValue, sourceFspId, headers) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this._backendRequests.getParties(idType, idValue, idSubValue);

            if(!response) {
                return 'No response from backend';
            }

            // make a callback to the source fsp with our dfspId indicating we own the party
            return this._mojaloopRequests.putParticipants(
                idType,
                idValue,
                idSubValue,
                { fspId: this._dfspId },
                sourceFspId,
                headers
            );
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, idValue }).error('Error in getParticipants');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putParticipantsError(
                idType, idValue, idSubValue, mojaloopError, sourceFspId, headers
            );
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with the result
     */
    async getParties(idType, idValue, idSubValue, sourceFspId, headers = {}) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this._backendRequests.getParties(idType, idValue, idSubValue);

            if(!response) {
                return 'No response from backend';
            }

            // project our internal party representation into a mojaloop parties request body
            const mlParty = {
                party: shared.internalPartyToMojaloopParty(response, this._dfspId, this._supportedCurrencies)
            };

            if (headers.tracestate && headers.traceparent) {
                headers.tracestate += `,${TRACESTATE_KEY_CALLBACK_START_TS}=${Date.now()}`;
            }
            return this._mojaloopRequests.putParties(idType, idValue, idSubValue, mlParty, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, idValue }).error('Error in getParties');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putPartiesError(idType, idValue, idSubValue, mojaloopError, sourceFspId, headers);
        }
    }

    /**
     * Asks the backend for a response to an incoming quote request and makes a callback to the originator with
     * the result
     */
    async quoteRequest(request, sourceFspId, headers = {}) {
        const quoteRequest = request.body;

        // keep track of our state.
        // note that instances of this model typically only live as long as it takes to
        // handle an incoming request and send a response asynchronously, but we hold onto
        // some state across async ops

        this.data = dto.quoteRequestStateDto(request);
        // persist the transfer record in the cache. if we crash after this at least we will
        // have a record of the request in the cache.
        await this._save();

        const log = this._logger.push({
            transferId: this.data.transferId,
            quoteId: quoteRequest.quoteId
        });

        try {
            const internalForm = shared.mojaloopQuoteRequestToInternal(quoteRequest);

            // Check the transactionRequestId exists in cache
            if(quoteRequest.transactionRequestId) {
                const previousTxnReq = await this._cache.get(`txnReqModel_${quoteRequest.transactionRequestId}`);
                if (previousTxnReq) {
                    internalForm.homeR2PTransactionId = previousTxnReq.homeR2PTransactionId;
                } else {
                    log.isErrorEnabled && log.error(`No previous transactionRequest found in cache with transactionRequestId: ${quoteRequest.transactionRequestId}. Unable to fetch homeR2PTransactionId.`);
                }
            }

            // make a call to the backend to ask for a quote response
            const response = await this._backendRequests.postQuoteRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';            }

            if(!response.expiration) {
                const expiration = new Date().getTime() + (this._expirySeconds * 1000);
                response.expiration = new Date(expiration).toISOString();
            }

            // project our internal quote response into mojaloop quote response form
            const mojaloopResponse = shared.internalQuoteResponseToMojaloop(response);

            // create our ILP packet and condition and tag them on to our internal quote response
            const { fulfilment, ilpPacket, condition } = this._ilp.getQuoteResponseIlp(quoteRequest, mojaloopResponse);

            mojaloopResponse.ilpPacket = ilpPacket;
            mojaloopResponse.condition = condition;

            // now store the fulfilment and the quote data against the quoteId in our cache
            this.data.quote = {
                request: quoteRequest,
                internalRequest: internalForm,
                response: response,
                mojaloopResponse: mojaloopResponse,
                fulfilment: fulfilment
            };
            await this._save();

            if (headers.tracestate && headers.traceparent) {
                headers.tracestate += `,${TRACESTATE_KEY_CALLBACK_START_TS}=${Date.now()}`;
            }
            const res = await this._mojaloopRequests.putQuotes(quoteRequest.quoteId, mojaloopResponse, sourceFspId, headers, { isoPostQuote: request.isoPostQuote });

            this.data.quoteResponse = {
                headers: res.originalRequest?.headers,
                body: mojaloopResponse,
            };
            this.metrics.quoteRequests.inc();
            this.data.currentState = SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
            await this._save();

            log.isInfoEnabled && log.info('quoteRequest is done');
            return res;
        }  catch (err) {
            log.push({ err }).error('Error in quoteRequest');
            const mojaloopError = await this._handleError(err);
            log.isInfoEnabled && log.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putQuotesError(quoteRequest.quoteId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
     * Notifies backend about the transactionRequest callback
     */
    async putTransactionRequest(request, transactionRequestId, sourceFspId, headers) {
        const putTransactionRequest = request.body;

        try {
            const internalForm = shared.mojaloopPutTransactionRequestToInternal(putTransactionRequest);

            // Check the transactionRequestId exists in cache and fetch homeR2PTransactionId
            if(transactionRequestId) {
                const previousTxnReq = await this._cache.get(`txnReqModel_${transactionRequestId}`);
                if(previousTxnReq) {
                    internalForm.homeR2PTransactionId = previousTxnReq.homeR2PTransactionId;
                    const udpatedTxnReq = {
                        ...previousTxnReq,
                        putTransactionRequestNotification: request
                    };
                    // Update transactionRequest model in cache with notification
                    await this._cache.set(`txnReqModel_${transactionRequestId}`, udpatedTxnReq);
                } else {
                    this._logger.isErrorEnabled && this._logger.error(`No previous transactionRequest found in cache with transactionRequestId: ${transactionRequestId}. Unable to fetch homeR2PTransactionId.`);
                }
            }

            // make a call to the backend about this notification anyway
            await this._backendRequests.putRequestToPayNotification(internalForm, transactionRequestId);
        }
        catch (err) {
            this._logger.push({ err, transactionRequestId }).error('Error in putTransactionRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putQuotesError(transactionRequestId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
     * This is executed as when GET /quotes/{ID} request is made to get the response of a previous POST /quotes request.
     * Gets the quoteResponse from the cache and makes a callback to the originator with result
     */
    async getQuoteRequest(quoteId, sourceFspId, headers) {
        try {
            // Get the quoteResponse data for the quoteId from the cache to be sent as a response to GET /quotes/{ID}
            const quoteResponse = await this._cache.get(`quoteResponse_${quoteId}`);

            // If no quoteResponse is found in the cache, make an error callback to the source fsp
            if (!quoteResponse) {
                const err = new Error('Quote Id not found');
                const mojaloopError = await this._handleError(err, Errors.MojaloopApiErrorCodes.QUOTE_ID_NOT_FOUND);
                this._logger.push({ mojaloopError, quoteId }).warn(`Sending error response to ${sourceFspId}`);
                return await this._mojaloopRequests.putQuotesError(quoteId, mojaloopError, sourceFspId, headers);
            }
            // Make a PUT /quotes/{ID} callback to the source fsp with the quote response
            return this._mojaloopRequests.putQuotes(quoteId, quoteResponse, sourceFspId, headers);
        }
        catch(err) {
            this._logger.push({ err, quoteId }).error('Error in getQuoteRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putQuotesError(quoteId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
     * Asks the backend for a response to an incoming transactoin request and makes a callback to the originator with
     * the result
     */
    async transactionRequest(transactionRequest, sourceFspId, headers) {
        try {
            const internalForm = shared.mojaloopTransactionRequestToInternal(transactionRequest);

            // make a call to the backend to ask for a quote response
            const response = await this._backendRequests.postTransactionRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            // project our internal quote response into mojaloop quote response form
            const mojaloopResponse = shared.internalTransactionRequestResponseToMojaloop(response);

            // make a callback to the source fsp with the quote response
            return this._mojaloopRequests.putTransactionRequests(
                transactionRequest.transactionRequestId, mojaloopResponse, sourceFspId, headers
            );
        }
        catch (err) {
            this._logger.push({ err }).error(`Error in transactionRequest ${transactionRequest?.transactionRequestId}`);
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putTransactionRequestsError(
                transactionRequest.transactionRequestId, mojaloopError, sourceFspId, headers
            );
        }
    }


    /**
     * Validates an incoming transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareTransfer(request, sourceFspId, headers) {
        this.metrics.transferPrepares.inc();
        const prepareRequest = request.body;
        try {
            // retrieve our quote data
            if (this._allowDifferentTransferTransactionId) {
                const transactionId = this._ilp.getTransactionObject(prepareRequest.ilpPacket).transactionId;
                this.data = await this._load(transactionId);
            } else {
                this.data = await this._load(prepareRequest.transferId);
            }

            const quote = this.data?.quote;

            if(!this.data || !quote) {
                // If using the sdk-scheme-adapter in place of the deprecated `mojaloop-connector`
                // make sure this is false. Scenarios that use `mojaloop-connector`
                // absolutely requires a previous quote before allowing a transfer to proceed.
                // This is a different to the a typical mojaloop sdk-scheme-adapter setup which allows this as an option.

                // Check whether to allow transfers without a previous quote.
                if (!this._allowTransferWithoutQuote) {
                    const errMessage = `Corresponding quote not found for transfer ${prepareRequest.transferId}`;
                    this._logger.isWarnEnabled && this._logger.warn(errMessage);
                    throw new Error(errMessage);
                }

                if (!this.data) {
                    this.data = {};
                }
            }

            // persist our state so we have a record if we crash during processing the prepare
            this.data.prepare = request;
            this.data.currentState = SDKStateEnum.PREPARE_RECEIVED;
            await this._save();

            // Calculate or retrieve fulfilment and condition
            let fulfilment = null;
            let condition = null;
            if (quote) {
                fulfilment = quote.fulfilment;
                condition = quote.mojaloopResponse.condition;
            } else {
                fulfilment = this._ilp.calculateFulfil(prepareRequest.ilpPacket);
                condition = this._ilp.calculateConditionFromFulfil(fulfilment);
            }

            // check incoming ILP matches our persisted values
            if (this._checkIlp && (prepareRequest.condition !== condition)) {
                const errMessage = `ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`;
                this._logger.isWarnEnabled && this._logger.warn(errMessage);
                throw new Error(errMessage);
            }

            if (this._rejectTransfersOnExpiredQuotes) {
                const now = new Date().toISOString();
                const expiration = quote.mojaloopResponse.expiration;
                if (now > expiration) {
                    const error = Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.QUOTE_EXPIRED);
                    this._logger.isErrorEnabled && this._logger.error(`Error in prepareTransfer: quote expired for transfer ${prepareRequest.transferId}, system time=${now} > quote time=${expiration}`);
                    await this.updateStateWithError(error);
                    return this._mojaloopRequests.putTransfersError(prepareRequest.transferId, error, sourceFspId, headers);
                }
            }

            // project the incoming transfer prepare into an internal transfer request
            const internalForm = shared.mojaloopPrepareToInternalTransfer(prepareRequest, quote, this._ilp, this._checkIlp);

            // make a call to the backend to inform it of the incoming transfer
            const response = await this._backendRequests.postTransfers(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            this._logger.isVerboseEnabled && this._logger.verbose(`Transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop transferId: ${prepareRequest.transferId}`);
            this.data.homeTransactionId = response.homeTransactionId;

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: response.completedTimestamp || new Date(),
                transferState: response.transferState || (this._reserveNotification ? FSPIOPTransferStateEnum.RESERVED : FSPIOPTransferStateEnum.COMMITTED),
                fulfilment: response.fulfilment || fulfilment,
                ...response.extensionList && {
                    extensionList: {
                        extension: response.extensionList,
                    },
                },
            };

            // make a callback to the source fsp with the transfer fulfilment
            const res = await this._mojaloopRequests.putTransfers(
                prepareRequest.transferId, mojaloopResponse, sourceFspId, headers
            );

            this.data.fulfil = {
                headers: res.originalRequest.headers,
                body: mojaloopResponse,
            };
            this.data.currentState = response.transferState || (this._reserveNotification ? SDKStateEnum.RESERVED : SDKStateEnum.COMPLETED);

            await this._save();
            return res;
        } catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error(`Error in prepareTransfer: ${prepareRequest?.transferId}`);
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putTransfersError(
                prepareRequest.transferId, mojaloopError, sourceFspId, headers
            );
        }
    }

    /**
    * Queries details of a transfer
    */
    async getTransfer(transferId, sourceFspId, headers) {
        try {
            // make a call to the backend to get transfer details
            const response = await this._backendRequests.getTransfers(transferId);

            if (!response) {
                return 'No response from backend';
            }
            this._logger.isDebugEnabled && this._logger.push({ transferId, response }).debug('getTransfer response');

            const ilpPaymentData = {
                transferId: transferId,
                homeTransactionId: response.homeTransactionId,
                from: shared.internalPartyToMojaloopParty(response.from, response.from.fspId),
                to: shared.internalPartyToMojaloopParty(response.to, response.to.fspId),
                amountType: response.amountType,
                expiration: response.expiration,
                currency: response.currency,
                amount: response.amount,
                transactionType: response.transactionType,
                subScenario: response.subScenario,
                note: response.note,
            };

            let fulfilment;
            if (this._dfspId === response.to.fspId) {
                fulfilment = this._ilp.getResponseIlp(ilpPaymentData).fulfilment;
            }

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: response.timestamp,
                transferState: response.transferState,
                fulfilment,
                ...response.extensions && {
                    extensionList: {
                        extension: response.extensions,
                    },
                },
            };

            // make a callback to the source fsp with the transfer fulfilment
            return this._mojaloopRequests.putTransfers(transferId, mojaloopResponse, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, transferId }).error('Error in getTransfers');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putTransfersError(transferId, mojaloopError, sourceFspId, headers);
        }
    }

    async postFxQuotes(request, sourceFspId, headers) {
        const { body } = request;
        try {
            this.data = dto.fxQuoteRequestStateDto(request);
            await this.saveFxState();

            const internalRequest = shared.mojaloopFxQuoteRequestToInternal(body);

            const beResponse = await this._backendRequests.postFxQuotes(internalRequest);
            if (!beResponse) {
                // make an error callback to the source fsp
                return 'No response from FX backend';
            }

            const mojaloopResponse = shared.internalFxQuoteResponseToMojaloop(beResponse);
            // create our ILP packet and condition and tag them on to our internal fxQuote response
            const { fulfilment, condition } = this._ilp.getFxQuoteResponseIlp(body, mojaloopResponse);

            mojaloopResponse.condition = condition;

            this.data.fxQuote = {
                request,
                internalRequest,
                response: beResponse,
                mojaloopResponse,
                fulfilment
                // think, if we need to store ilpPacket as well
            };
            await this.saveFxState();

            const res = await this._mojaloopRequests.putFxQuotes(body.conversionRequestId, mojaloopResponse, sourceFspId, headers);

            this.data.fxQuoteResponse = {
                headers: res.originalRequest.headers,
                body: mojaloopResponse,
            };

            this.data.currentState = SDKStateEnum.FX_QUOTE_WAITING_FOR_ACCEPTANCE;
            await this.saveFxState();

            return res;
        } catch (err) {
            this._logger.push({ err }).error(`Error in postFxQuotes  [conversionRequestId: ${body.conversionRequestId}]`);
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putFxQuotesError(
                body.conversionRequestId, mojaloopError, sourceFspId, headers
            );
        }
    }

    async postFxTransfers(request, sourceFspId, headers) {
        const { body } = request;
        try {
            // todo: assume commitRequestId from fxTransfer should be same as conversionTerms.conversionId from fxQuotes
            this.data = await this.loadFxState(body.commitRequestId);

            if (!this.data?.fxQuote) {
                throw new Error(`Corresponding fxQuote not found for commitRequestId ${body.commitRequestId}`);
            }
            const { fxQuote } = this.data;

            this.data.fxPrepare = request;
            this.data.currentState = SDKStateEnum.FX_PREPARE_RECEIVED;
            await this.saveFxState();

            const { fulfilment } = fxQuote;
            const { condition } = fxQuote.mojaloopResponse;

            // check incoming ILP matches our persisted values
            if (this._checkIlp && (body.condition !== condition)) {
                throw new Error(`ILP condition in fxTransfer prepare for ${body.commitRequestId} does not match fxQuote`);
            }

            if (this._rejectTransfersOnExpiredQuotes) {
                const now = new Date().toISOString();
                const { expiration } = fxQuote.mojaloopResponse;
                if (now > expiration) {
                    const error = Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.QUOTE_EXPIRED);
                    this._logger.error(`Error in prepareFxTransfer: fxQuote expired for fxTransfer ${body.commitRequestId}, system time=${now} > fxQuote time=${expiration}`);
                    await this.updateStateWithError(error);
                    // todo: maybe, throw error here, and process it in catch block?
                    return this._mojaloopRequests.putFxTransfersError(body.commitRequestId, error, sourceFspId, headers);
                }
            }

            const internalForm = shared.mojaloopFxTransferPrepareToInternal(body, fxQuote);

            const beResponse = await this._backendRequests.postFxTransfers(internalForm);
            if (!beResponse) {
                // make an error callback to the source fsp
                return 'No response from FX backend';
            }

            this._logger.info(`fxTransfer accepted by backend returning homeTransactionId: ${beResponse.homeTransactionId} for mojaloop commitRequestId: ${body.commitRequestId}`);
            this.data.homeTransactionId = beResponse.homeTransactionId;

            // create a  mojaloop fxTransfer fulfil response
            const mojaloopResponse = shared.internalFxTransferResponseToMojaloop(beResponse, fulfilment);
            const res = await this._mojaloopRequests.putFxTransfers(body.commitRequestId, mojaloopResponse, sourceFspId, headers);

            this.data.fulfil = {
                headers: res.originalRequest.headers,
                body: mojaloopResponse,
            };
            this.data.currentState = beResponse.conversionState;
            await this.saveFxState();

            return res;
        } catch (err) {
            this._logger.push({ err }).error(`Error in postFxTransfer  [commitRequestId: ${body.commitRequestId}]`);
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putFxTransfersError(
                body.commitRequestId, mojaloopError, sourceFspId, headers
            );
        }
    }

    /**
     * Asks the backend for a response to an incoming bulk quotes request and makes a callback to the originator with
     * the results.
     */
    async bulkQuoteRequest(bulkQuoteRequest, sourceFspId, headers) {
        const { bulkQuoteId } = bulkQuoteRequest;
        const fulfilments = {};
        try {
            const internalForm = shared.mojaloopBulkQuotesRequestToInternal(bulkQuoteRequest);

            // make a call to the backend to ask for bulk quotes response
            const response = await this._backendRequests.postBulkQuotes(internalForm);

            if (!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            if (!response.expiration) {
                const expiration = new Date().getTime() + (this._expirySeconds * 1000);
                response.expiration = new Date(expiration).toISOString();
            }

            // project our internal bulk quotes response into mojaloop bulk quotes response form
            const mojaloopResponse = shared.internalBulkQuotesResponseToMojaloop(response);

            // create our ILP packet and condition and tag them on to our internal quote response
            bulkQuoteRequest.individualQuotes.map((quote) => {
                // TODO: Optimize with a HashMap
                const mojaloopIndividualQuote = mojaloopResponse.individualQuoteResults.find(
                    (quoteResult) => quoteResult.quoteId === quote.quoteId
                );
                if (!mojaloopIndividualQuote.errorInformation) {
                    const quoteRequest = {
                        transactionId: quote.transactionId,
                        quoteId: quote.quoteId,
                        payee: quote.payee,
                        payer: bulkQuoteRequest.payer,
                        transactionType: quote.transactionType,
                        subScenario: quote.subScenario,
                        expiration: response.expiration,
                    };

                    const quoteResponse = {
                        transferAmount: mojaloopIndividualQuote.transferAmount,
                        note: mojaloopIndividualQuote.note || '',
                    };
                    const { fulfilment, ilpPacket, condition } = this._ilp.getQuoteResponseIlp(quoteRequest, quoteResponse);

                    // mutate individual quotes in `mojaloopResponse`
                    mojaloopIndividualQuote.ilpPacket = ilpPacket;
                    mojaloopIndividualQuote.condition = condition;

                    fulfilments[quote.quoteId] = fulfilment;
                }
            });

            // now store the fulfilments and the bulk quotes data against the bulkQuoteId in our cache
            await this._cache.set(`bulkQuotes_${bulkQuoteId}`, {
                request: bulkQuoteRequest,
                internalRequest: internalForm,
                mojaloopResponse: mojaloopResponse,
                response,
                fulfilments
            });

            // make a callback to the source fsp with the quote response
            return this._mojaloopRequests.putBulkQuotes(bulkQuoteId, mojaloopResponse, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error in bulkQuotesRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkQuotesError(bulkQuoteId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
    * Queries details of a bulk quote
    */
    async getBulkQuote(bulkQuoteId, sourceFspId, headers) {
        try {
            // make a call to the backend to get bulk quote details
            const response = await this._backendRequests.getBulkQuotes(bulkQuoteId);

            if (!response) {
                return 'No response from backend';
            }

            // project our internal quote response into mojaloop bulk quote response form
            const mojaloopResponse = shared.internalBulkQuotesResponseToMojaloop(response);

            // make a callback to the source fsp with the bulk quote response
            return this._mojaloopRequests.putBulkQuotes(bulkQuoteId, mojaloopResponse, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, bulkQuoteId }).error('Error in getBulkQuote');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkQuotesError(bulkQuoteId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
     * Validates  an incoming bulk transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareBulkTransfer(bulkPrepareRequest, sourceFspId, headers) {
        try {
            // retrieve bulk quote data
            const bulkQuote = await this._cache.get(`bulkQuotes_${bulkPrepareRequest.bulkQuoteId}`);

            if (!bulkQuote) {
                // Check whether to allow transfers without a previous quote.
                if (!this._allowTransferWithoutQuote) {
                    const errMessage = `Corresponding bulk quotes not found for bulk transfers ${bulkPrepareRequest.bulkTransferId}`;
                    this._logger.isWarnEnabled && this._logger.warn(errMessage);
                    throw new Error(errMessage);
                }
            }

            // create an index of individual quote results indexed by transactionId for faster lookups
            const quoteResultsByTrxId = {};

            if (bulkQuote && bulkQuote.mojaloopResponse && bulkQuote.mojaloopResponse.individualQuoteResults) {
                for (const quoteResult of bulkQuote.mojaloopResponse.individualQuoteResults) {
                    quoteResultsByTrxId[quoteResult.transactionId] = quoteResult;
                }
            }

            // transfer fulfilments
            const fulfilments = {};

            // collect errors for each transfer
            let individualTransferErrors = [];

            // validate individual transfer
            for (const transfer of bulkPrepareRequest.individualTransfers) {
                // decode ilpPacked for this transfer to get transaction object
                const transactionObject = this._ilp.getTransactionObject(transfer.ilpPacket);

                // we use the transactionId from the decoded ilpPacked in the transfer to match a corresponding quote
                const quote = quoteResultsByTrxId[transactionObject.transactionId] || null;

                // calculate or retrieve fulfilments and conditions
                let fulfilment = null;
                let condition = null;

                if (quote) {
                    fulfilment = bulkQuote.fulfilments[quote.quoteId];
                    condition = quote.condition;
                }
                else {
                    fulfilment = this._ilp.calculateFulfil(transfer.ilpPacket);
                    condition = this._ilp.calculateConditionFromFulfil(fulfilment);
                }

                fulfilments[transfer.transferId] = fulfilment;

                // check incoming ILP matches our persisted values
                if (this._checkIlp && (transfer.condition !== condition)) {
                    const transferError = this._handleError(new Error(`ILP condition in bulk transfers prepare for ${transfer.transferId} does not match quote`));
                    individualTransferErrors.push({ transferId: transfer.transferId, transferError });
                }
            }

            if (bulkQuote && this._rejectTransfersOnExpiredQuotes) {
                const now = new Date();
                const expiration = new Date(bulkQuote.mojaloopResponse.expiration);
                if (now > expiration) {
                    // TODO: Verify and align with actual schema for bulk transfers error endpoint
                    const error = Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.QUOTE_EXPIRED);
                    this._logger.isErrorEnabled && this._logger.error(`Error in prepareBulkTransfers: bulk quotes expired for bulk transfers ${bulkPrepareRequest.bulkTransferId}, system time=${now.toISOString()} > quote time=${expiration.toISOString()}`);
                    return this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.bulkTransferId, error, sourceFspId, headers);
                }
            }

            if (individualTransferErrors.length) {
                // TODO: Verify and align with actual schema for bulk transfers error endpoint
                const mojaloopErrorResponse = {
                    bulkTransferState: FSPIOPBulkTransferStateEnum.REJECTED,

                    individualTransferResults: individualTransferErrors.map(({ transferId, transferError }) => ({
                        transferId,
                        errorInformation: transferError,
                    }))
                };
                this._logger.isErrorEnabled && this._logger.push({ ...individualTransferErrors }).error('Error in prepareBulkTransfers');
                this._logger.isDebugEnabled && this._logger.push({ ...individualTransferErrors }).debug(`Sending error response to ${sourceFspId}`);

                return this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.transferId,  mojaloopErrorResponse, sourceFspId, headers);
            }

            // project the incoming bulk transfer prepare into an internal bulk transfer request
            const internalForm = shared.mojaloopBulkPrepareToInternalBulkTransfer(bulkPrepareRequest, bulkQuote, this._ilp);

            // make a call to the backend to inform it of the incoming bulk transfer
            const response = await this._backendRequests.postBulkTransfers(internalForm);

            if (!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            this._logger.isDebugEnabled && this._logger.debug(`Bulk transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop bulk transferId: ${bulkPrepareRequest.bulkTransferId}`);

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = shared.internalBulkTransfersResponseToMojaloop(response, fulfilments);

            // make a callback to the source fsp with the transfer fulfilment
            return this._mojaloopRequests.putBulkTransfers(bulkPrepareRequest.bulkTransferId, mojaloopResponse, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error in prepareBulkTransfers');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.bulkTransferId, mojaloopError, sourceFspId, headers);
        }
    }

    /**
    * Queries details of a bulk transfer
    */
    async getBulkTransfer(bulkTransferId, sourceFspId, headers) {
        try {
            // make a call to the backend to get bulk transfer details
            const response = await this._backendRequests.getBulkTransfers(bulkTransferId);

            if (!response) {
                return 'No response from backend';
            }

            let individualTransferResults = [];

            for (const transfer of response.internalRequest.individualTransfers) {
                const ilpPaymentData = {
                    transferId: transfer.transferId,
                    to: shared.internalPartyToMojaloopParty(transfer.to, transfer.to.fspId),
                    amountType: transfer.amountType,
                    currency: transfer.currency,
                    amount: transfer.amount,
                    expiration: transfer.expiration,
                    transactionType: transfer.transactionType,
                    subScenario: transfer.subScenario,
                    note: transfer.note,
                };
                let fulfilment;
                if (this._dfspId === transfer.to.fspId) {
                    fulfilment = this._ilp.getResponseIlp(ilpPaymentData).fulfilment;
                }
                const transferResult = { transferId: transfer.transferId, fulfilment };
                transfer.errorInformation && (transferResult.errorInformation = transfer.errorInformation);
                transfer.extensionList && (transferResult.extensionList = transfer.extensionList);
                individualTransferResults.push(transferResult);
            }

            // create a  mojaloop bulk transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: response.timestamp,
                bulkTransferState: response.bulkTransferState,
                individualTransferResults,
                ...response.extensions && {
                    extensionList: {
                        extension: response.extensions,
                    },
                },
            };

            // make a callback to the source fsp with the bulk transfer fulfilments
            return this._mojaloopRequests.putBulkTransfers(bulkTransferId, mojaloopResponse, sourceFspId, headers);
        }
        catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, bulkTransferId }).error('Error in getBulkTransfer');
            const mojaloopError = await this._handleError(err);
            this._logger.isInfoEnabled && this._logger.push({ mojaloopError }).info(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkTransfersError(bulkTransferId, mojaloopError, sourceFspId, headers);
        }
    }

    async sendFxPatchNotificationToBackend(body, conversionId) {
        try {
            this.data = await this.loadFxState(conversionId);

            if(!this.data) {
                this.data = {};
            }
            this.data.finalNotification = body;
            if(body.conversionState === FSPIOPTransferStateEnum.COMMITTED) {
                this.data.currentState = SDKStateEnum.COMPLETED;
            }
            else if(body.conversionState === FSPIOPTransferStateEnum.ABORTED){
                this.data.currentState =  SDKStateEnum.ABORTED;
            }
            else{
                this.data.currentState = SDKStateEnum.ERROR_OCCURRED;
                this.data.lastError = 'Final notification state not COMMITTED or ABORTED';
            }

            await this.saveFxState();

            const res = await this._backendRequests.patchFxTransfersNotification(this.data,conversionId);
            return res;
        } catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, conversionId }).error(`Error notifying backend of final conversionId state equal to: ${body.conversionState} `);
        }
    }
    /**
    * Forwards Switch notification for fulfiled transfer to the DFSP backend, when acting as a payee
    */
    async sendNotificationToPayee(body, transferId) {
        try {
            // load any cached state for this transfer e.g. quote request/response etc...
            this.data = await this._load(transferId);

            // if we didnt have anything cached, start from scratch
            if(!this.data) {
                this.data = {};
            }

            // tag the final notification body on to the state
            this.data.finalNotification = body;

            if(body.transferState === FSPIOPTransferStateEnum.COMMITTED) {
                // if the transfer was successful in the switch, set the overall transfer state to COMPLETED
                this.data.currentState = SDKStateEnum.COMPLETED;
            }
            else if(body.transferState === FSPIOPTransferStateEnum.ABORTED) {
                // if the transfer was ABORTED in the switch, set the overall transfer state to ABORTED
                this.data.currentState = SDKStateEnum.ABORTED;
            }
            else {
                // if the final notification has anything other than COMMITTED as the final state, set an error
                // in the transfer state.
                this.data.currentState = SDKStateEnum.ERROR_OCCURRED;
                this.data.lastError = 'Final notification state not COMMITTED';
            }

            await this._save();

            const res = await this._backendRequests.putTransfersNotification(this.data, transferId);
            return res;
        } catch (err) {
            this._logger.isErrorEnabled && this._logger.push({ err, transferId }).error(`Error notifying backend of final transfer state equal to: ${body.transferState}`);
        }
    }

    async _handleError(err) {
        // by default use a generic server error
        let mojaloopError = (new Errors.MojaloopFSPIOPError(err, null, null, Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR)).toApiErrorObject();
        if(err instanceof HTTPResponseError) {
            // this is an http response error e.g. from calling DFSP backend
            const e = err.getData();
            if(e.res && e.res.data) {
                // look for a standard mojaloop error that matches the statusCode
                let mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${e.res.data.statusCode}`);
                let errorDescription = e.res.data.message;
                if(mojaloopErrorCode) {
                    // use the standard mojaloop error object
                    mojaloopError = (new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode)).toApiErrorObject();
                    if(errorDescription) {
                        // if the error has a description, use that instead of the default mojaloop description
                        // note that the mojaloop API spec allows any string up to 128 utf8 characters to be sent
                        // in the errorDescription field.
                        mojaloopError.errorInformation.errorDescription = errorDescription;
                    }
                }
                else {
                    // this is a custom error, so construct a mojaloop spec body
                    mojaloopError = {
                        errorInformation: {
                            errorCode: e.res.data.statusCode,
                            errorDescription: e.res.data.message,
                        }
                    };
                }
            }
        }
        if (this.data) {
            //we have persisted state so update that with this error
            this.data.lastError = {
                originalError: err.stack || safeStringify(err),
                mojaloopError: mojaloopError,
            };
            this.data.currentState = SDKStateEnum.ERROR_OCCURRED;
            this.data.transferId
                ? await this._save()
                : await this.saveFxState();
        }

        return mojaloopError;
    }

    /**
     * Persists the model state to cache for reinstantiation at a later point
     */
    async _save() {
        try {
            const res = await this._cache.set(`transferModel_in_${this.data.transferId}`, this.data, this._cacheTtl);
            this._logger.push({ res }).debug('Persisted transfer model in cache');
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
    async _load(transferId) {
        try {
            const data = await this._cache.get(`transferModel_in_${transferId}`);
            return data;
        }
        catch(err) {
            this._logger.isErrorEnabled && this._logger.push({ err, transferId }).error('Error loading transfer model');
            throw err;
        }
    }

    async saveFxState() { // fxQuote + fxTransfer
        const key = this.makeFxQuoteCacheKey(this.data?.conversionId);
        const res = await this._cache.set(key, this.data, this._cacheTtl);
        this._logger.push({ key, res }).debug('fxState is saved in cache');
    }

    async loadFxState(conversionId) {
        const key = this.makeFxQuoteCacheKey(conversionId);
        const data = await this._cache.get(key);
        this._logger.push({ key, data }).debug('fxState is loaded from cache');
        return data;
    }

    makeFxQuoteCacheKey(conversionId) {
        if (!conversionId) {
            throw new Error('No conversionId for making cache key');
        }
        return `${CacheKeyPrefixes.FX_QUOTE_INBOUND}_${conversionId}`;
    }
}


module.exports = InboundTransfersModel;

