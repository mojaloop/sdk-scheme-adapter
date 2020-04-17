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


const {
    BackendRequests,
    HTTPResponseError,
} = require('@internal/requests');
const {
    MojaloopRequests,
    Ilp,
    Errors,
} = require('@mojaloop/sdk-standard-components');
const shared = require('@internal/shared');


/**
 *  Models the operations required for performing inbound transfers
 */
class InboundTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectTransfersOnExpiredQuotes = config.rejectTransfersOnExpiredQuotes;
        this._allowTransferWithoutQuote = config.allowTransferWithoutQuote;

        this._mojaloopRequests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });

        this._backendRequests = new BackendRequests({
            logger: this._logger,
            backendEndpoint: config.backendEndpoint,
            dfspId: config.dfspId
        });

        this._checkIlp = config.checkIlp;

        this._ilp = new Ilp({
            secret: config.ilpSecret
        });
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
            this._logger.push({ err }).log('Error in getOTP');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putAuthorizationsError(transactionRequestId,
                mojaloopError, sourceFspId);
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with our dfspId if found
     */
    async getParticipants(idType, idValue, idSubValue, sourceFspId) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this._backendRequests.getParties(idType, idValue, idSubValue);

            if(!response) {
                return 'No response from backend';
            }

            // make a callback to the source fsp with our dfspId indicating we own the party
            return this._mojaloopRequests.putParticipants(idType, idValue, idSubValue, { fspId: this._dfspId },
                sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in getParticipants');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putParticipantsError(idType, idValue, idSubValue,
                mojaloopError, sourceFspId);
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with the result
     */
    async getParties(idType, idValue, idSubValue, sourceFspId) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this._backendRequests.getParties(idType, idValue, idSubValue);

            if(!response) {
                return 'No response from backend';
            }

            // project our internal party representation into a mojaloop partyies request body
            const mlParty = {
                party: shared.internalPartyToMojaloopParty(response, this._dfspId)
            };

            // make a callback to the source fsp with the party info
            return this._mojaloopRequests.putParties(idType, idValue, idSubValue, mlParty, sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in getParties');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putPartiesError(idType, idValue, idSubValue,
                mojaloopError, sourceFspId);
        }
    }

    /**
     * Queries details of a transfer
     */
    async getTransfer(transferId, sourceFspId) {
        try {
            // make a call to the backend to get transfer details
            const response = await this._backendRequests.getTransfers(transferId);

            if(!response) {
                return 'No response from backend';
            }

            const ilpPaymentData = {
                transferId: transferId,
                homeTransactionId: response.homeTransactionId,
                from: shared.internalPartyToMojaloopParty(response.from, response.from.fspId),
                to: shared.internalPartyToMojaloopParty(response.to, response.to.fspId),
                amountType: response.amountType,
                currency: response.currency,
                amount: response.amount,
                transactionType: response.transactionType,
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
            return this._mojaloopRequests.putTransfers(transferId, mojaloopResponse,
                sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in getTransfers');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putTransfersError(transferId,
                mojaloopError, sourceFspId);
        }
    }


    /**
     * Asks the backend for a response to an incoming quote request and makes a callback to the originator with
     * the result
     */
    async quoteRequest(quoteRequest, sourceFspId) {
        try {
            const internalForm = shared.mojaloopQuoteRequestToInternal(quoteRequest);

            // make a call to the backend to ask for a quote response
            const response = await this._backendRequests.postQuoteRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            if(!response.expiration) {
                const expiration = new Date().getTime() + (this._expirySeconds * 1000);
                response.expiration = new Date(expiration).toISOString();
            }

            // project our internal quote reponse into mojaloop quote response form
            const mojaloopResponse = shared.internalQuoteResponseToMojaloop(response);

            // create our ILP packet and condition and tag them on to our internal quote response
            const { fulfilment, ilpPacket, condition } = this._ilp.getQuoteResponseIlp(quoteRequest, mojaloopResponse);

            mojaloopResponse.ilpPacket = ilpPacket;
            mojaloopResponse.condition = condition;

            // now store the fulfilment and the quote data against the quoteId in our cache
            await this._cache.set(`quote_${quoteRequest.transactionId}`, {
                request: quoteRequest,
                internalRequest: internalForm,
                response: response,
                mojaloopResponse: mojaloopResponse,
                fulfilment: fulfilment
            });

            // make a callback to the source fsp with the quote response
            return this._mojaloopRequests.putQuotes(quoteRequest.quoteId, mojaloopResponse, sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in quoteRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putQuotesError(quoteRequest.quoteId,
                mojaloopError, sourceFspId);
        }
    }

    /**
     * Asks the backend for a response to an incoming transactoin request and makes a callback to the originator with
     * the result
     */
    async transactionRequest(transactionRequest, sourceFspId) {
        try {
            const internalForm = shared.mojaloopTransactionRequestToInternal(transactionRequest);

            // make a call to the backend to ask for a quote response
            const response = await this._backendRequests.postTransactionRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            // project our internal quote reponse into mojaloop quote response form
            const mojaloopResponse = shared.internalTransactionRequestResponseToMojaloop(response);

            // make a callback to the source fsp with the quote response
            return this._mojaloopRequests.putTransactionRequests(transactionRequest.transactionRequestId, mojaloopResponse, sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in transactionRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putTransactionRequestsError(transactionRequest.transactionRequestId,
                mojaloopError, sourceFspId);
        }
    }


    /**
     * Validates  an incoming transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareTransfer(prepareRequest, sourceFspId) {
        try {

            // retrieve our quote data
            const quote = await this._cache.get(`quote_${prepareRequest.transferId}`);

            if(!quote) {
                // Check whether to allow transfers without a previous quote.
                if(!this._allowTransferWithoutQuote) {
                    throw new Error(`Corresponding quote not found for transfer ${prepareRequest.transferId}`);
                }
            }

            // Calculate or retrieve fulfilment and condition
            let fulfilment = null;
            let condition = null;
            if(quote) {
                fulfilment = quote.fulfilment;
                condition = quote.mojaloopResponse.condition;
            }
            else {
                fulfilment = this._ilp.calculateFulfil(prepareRequest.ilpPacket);
                condition = this._ilp.calculateConditionFromFulfil(fulfilment);
            }

            // check incoming ILP matches our persisted values
            if(this._checkIlp && (prepareRequest.condition !== condition)) {
                throw new Error(`ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`);
            }


            if (quote && this._rejectTransfersOnExpiredQuotes) {
                const now = new Date().toISOString();
                const expiration = quote.mojaloopResponse.expiration;
                if (now > expiration) {
                    const error = Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.QUOTE_EXPIRED);
                    this._logger.error(`Error in prepareTransfer: quote expired for transfer ${prepareRequest.transferId}, system time=${now} > quote time=${expiration}`);
                    return this._mojaloopRequests.putTransfersError(prepareRequest.transferId, error, sourceFspId);
                }
            }

            // project the incoming transfer prepare into an internal transfer request
            const internalForm = shared.mojaloopPrepareToInternalTransfer(prepareRequest, quote);

            // make a call to the backend to inform it of the incoming transfer
            const response = await this._backendRequests.postTransfers(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            this._logger.log(`Transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop transferId: ${prepareRequest.transferId}`);

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: new Date(),
                transferState: 'COMMITTED',
                fulfilment: fulfilment,
                ...response.extensionList && {
                    extensionList: {
                        extension: response.extensionList,
                    },
                },
            };

            // make a callback to the source fsp with the transfer fulfilment
            return this._mojaloopRequests.putTransfers(prepareRequest.transferId, mojaloopResponse,
                sourceFspId);
        }
        catch(err) {
            this._logger.push({ err }).log('Error in prepareTransfer');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putTransfersError(prepareRequest.transferId,
                mojaloopError, sourceFspId);
        }
    }

    async _handleError(err) {
        let mojaloopErrorCode = Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR;

        if(err instanceof HTTPResponseError) {
            const e = err.getData();
            if(e.res && e.res.body) {
                try {
                    const bodyObj = JSON.parse(e.res.body);
                    mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${bodyObj.statusCode}`);
                }
                catch(ex) {
                    // do nothing
                    this._logger.push({ ex }).log('Error parsing error message body as JSON');
                }
            }

        }

        return new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode).toApiErrorObject();
    }
}


module.exports = InboundTransfersModel;
