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
        this._reserveNotification = config.reserveNotification;

        this._mojaloopRequests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            bulkTransfersEndpoint: config.bulkTransfersEndpoint,
            transactionRequestsEndpoint: config.transactionRequestsEndpoint,
            bulkQuotesEndpoint: config.bulkQuotesEndpoint,
            dfspId: config.dfspId,
            tls: config.inbound.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth,
            resourceVersions: config.resourceVersions
        });

        this._backendRequests = new BackendRequests({
            logger: this._logger,
            backendEndpoint: config.backendEndpoint,
            dfspId: config.dfspId
        });

        this._checkIlp = config.checkIlp;

        this._ilp = new Ilp({
            secret: config.ilpSecret,
            logger: this._logger,
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
                transferState: this._reserveNotification ? 'RESERVED' : 'COMMITTED',
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

    /**
    * Queries details of a transfer
    */
    async getTransfer(transferId, sourceFspId) {
        try {
            // make a call to the backend to get transfer details
            const response = await this._backendRequests.getTransfers(transferId);

            if (!response) {
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
        catch (err) {
            this._logger.push({ err }).log('Error in getTransfers');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putTransfersError(transferId,
                mojaloopError, sourceFspId);
        }
    }

    /**
     * Asks the backend for a response to an incoming bulk quotes request and makes a callback to the originator with
     * the results.
     */
    async bulkQuoteRequest(bulkQuoteRequest, sourceFspId) {
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
                const quoteRequest = {
                    transactionId: quote.transactionId,
                    quoteId: quote.quoteId,
                    payee: quote.payee,
                    payer: bulkQuoteRequest.payer,
                    transactionType: quote.transactionType,
                };
                // TODO: Optimize with a HashMap
                const mojaloopIndividualQuote = mojaloopResponse.individualQuoteResults.find(
                    (quoteResult) => quoteResult.quoteId === quote.quoteId
                );
                const quoteResponse = {
                    transferAmount: mojaloopIndividualQuote.transferAmount,
                    note: mojaloopIndividualQuote.note || '',
                };
                const { fulfilment, ilpPacket, condition } = this._ilp.getQuoteResponseIlp(
                    quoteRequest, quoteResponse);

                // mutate individual quotes in `mojaloopResponse`
                mojaloopIndividualQuote.ilpPacket = ilpPacket;
                mojaloopIndividualQuote.condition = condition;

                fulfilments[quote.quoteId] = fulfilment;
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
            return this._mojaloopRequests.putBulkQuotes(bulkQuoteId, mojaloopResponse, sourceFspId);
        }
        catch (err) {
            this._logger.push({ err }).log('Error in bulkQuotesRequest');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putBulkQuotesError(bulkQuoteId,
                mojaloopError, sourceFspId);
        }
    }

    /**
    * Queries details of a bulk quote
    */
    async getBulkQuote(bulkQuoteId, sourceFspId) {
        try {
            // make a call to the backend to get bulk quote details
            const response = await this._backendRequests.getBulkQuotes(bulkQuoteId);

            if (!response) {
                return 'No response from backend';
            }

            // project our internal quote reponse into mojaloop bulk quote response form
            const mojaloopResponse = shared.internalBulkQuotesResponseToMojaloop(response);

            // make a callback to the source fsp with the bulk quote response
            return this._mojaloopRequests.putBulkQuotes(bulkQuoteId, mojaloopResponse,
                sourceFspId);
        }
        catch (err) {
            this._logger.push({ err }).log('Error in getBulkQuote');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkQuotesError(bulkQuoteId,
                mojaloopError, sourceFspId);
        }
    }

    /**
     * Validates  an incoming bulk transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareBulkTransfer(bulkPrepareRequest, sourceFspId) {
        try {
            // retrieve bulk quote data
            const bulkQuote = await this._cache.get(`bulkQuotes_${bulkPrepareRequest.bulkQuoteId}`);

            if (!bulkQuote) {
                // Check whether to allow transfers without a previous quote.
                if (!this._allowTransferWithoutQuote) {
                    throw new Error(`Corresponding bulk quotes not found for bulk transfers ${bulkPrepareRequest.bulkTransferId}`);
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
                    this._logger.error(`Error in prepareBulkTransfers: bulk quotes expired for bulk transfers ${bulkPrepareRequest.bulkTransferId}, system time=${now.toISOString()} > quote time=${expiration.toISOString()}`);
                    return this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.bulkTransferId, error, sourceFspId);
                }
            }

            if (individualTransferErrors.length) {
                // TODO: Verify and align with actual schema for bulk transfers error endpoint
                const mojaloopErrorResponse = {
                    bulkTransferState: 'REJECTED',
                    // eslint-disable-next-line no-unused-vars
                    individualTransferResults: individualTransferErrors.map(({ transferId, transferError }) => ({
                        transferId,
                        errorInformation: transferError,
                    }))
                };
                this._logger.push({ ...individualTransferErrors }).log('Error in prepareBulkTransfers');
                this._logger.push({ ...individualTransferErrors }).log(`Sending error response to ${sourceFspId}`);

                return await this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.transferId,
                    mojaloopErrorResponse, sourceFspId);
            }

            // project the incoming bulk transfer prepare into an internal bulk transfer request
            const internalForm = shared.mojaloopBulkPrepareToInternalBulkTransfer(bulkPrepareRequest, bulkQuote, this._ilp);

            // make a call to the backend to inform it of the incoming bulk transfer
            const response = await this._backendRequests.postBulkTransfers(internalForm);

            if (!response) {
                // make an error callback to the source fsp
                return 'No response from backend';
            }

            this._logger.log(`Bulk transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop bulk transferId: ${bulkPrepareRequest.bulkTransferId}`);

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: new Date(),
                bulkTransferState: 'COMMITTED',
            };

            if (response.individualTransferResults && response.individualTransferResults.length) {
                // eslint-disable-next-line no-unused-vars
                mojaloopResponse.individualTransferResults = response.individualTransferResults.map((transfer) => {
                    return {
                        transferId: transfer.transferId,
                        fulfilment: fulfilments[transfer.transferId],
                        ...transfer.extensionList && {
                            extensionList: {
                                extension: transfer.extensionList,
                            },
                        }
                    };
                });
            }

            // make a callback to the source fsp with the transfer fulfilment
            return this._mojaloopRequests.putBulkTransfers(bulkPrepareRequest.bulkTransferId, mojaloopResponse, sourceFspId);
        }
        catch (err) {
            this._logger.push({ err }).log('Error in prepareBulkTransfers');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return await this._mojaloopRequests.putBulkTransfersError(bulkPrepareRequest.bulkTransferId,
                mojaloopError, sourceFspId);
        }
    }

    /**
    * Queries details of a bulk transfer
    */
    async getBulkTransfer(bulkTransferId, sourceFspId) {
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
                    transactionType: transfer.transactionType,
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
            return this._mojaloopRequests.putBulkTransfers(bulkTransferId, mojaloopResponse,
                sourceFspId);
        }
        catch (err) {
            this._logger.push({ err }).log('Error in getBulkTransfer');
            const mojaloopError = await this._handleError(err);
            this._logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            return this._mojaloopRequests.putBulkTransfersError(bulkTransferId,
                mojaloopError, sourceFspId);
        }
    }

    /**
    * Forwards Switch notification for fulfiled transfer to the DFSP backend, when acting as a payee 
    */
    async sendNotificationToPayee(body, transferId) {
        try {
            const res = await this._backendRequests.putTransfersNotification(body, transferId);
            return res;
        } catch (err) {
            this._logger.push({ err }).log('Error in sendNotificationToPayee');
        }
    }

    async _handleError(err) {
        let mojaloopErrorCode = Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR;

        if(err instanceof HTTPResponseError) {
            const e = err.getData();
            if(e.res && e.res.data) {
                mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${e.res.data.statusCode}`);
            }
        }

        return new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode).toApiErrorObject();
    }
}


module.exports = InboundTransfersModel;
