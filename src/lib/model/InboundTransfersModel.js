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


const BackendRequests = require('@internal/requests').BackendRequests;
const HTTPResponseError = require('@internal/requests').HTTPResponseError;
const MojaloopRequests = require('@mojaloop/sdk-standard-components').MojaloopRequests;
const Ilp = require('@mojaloop/sdk-standard-components').Ilp;
const Errors = require('@mojaloop/sdk-standard-components').Errors;
const Metrics = require('@mojaloop/central-services-metrics');
const shared = require('@internal/shared');

const ASYNC_TIMEOUT_MILLS = 30000;


/**
 *  Models the operations required for performing inbound transfers
 */
class InboundTransfersModel {
    constructor(config) {
        this.cache = config.cache;
        this.logger = config.logger;
        this.ASYNC_TIMEOUT_MILLS = config.asyncTimeoutMillis || ASYNC_TIMEOUT_MILLS;
        this.dfspId = config.dfspId;
        this.expirySeconds = config.expirySeconds;
        this.rejectTransfersOnExpiredQuotes = config.rejectTransfersOnExpiredQuotes;
        this.allowTransferWithoutQuote = config.allowTransferWithoutQuote;

        this._mojaloopRequests = new MojaloopRequests({
            logger: this.logger,
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

        this.backendRequests = new BackendRequests({
            logger: this.logger,
            backendEndpoint: config.backendEndpoint,
            dfspId: config.dfspId
        });

        this.checkIlp = config.checkIlp;

        this.ilp = new Ilp({
            secret: config.ilpSecret
        });
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with our dfspId if found
     */
    async getParticipantsByTypeAndId(idType, idValue, sourceFspId) {
        const histTimerEnd = Metrics.getHistogram(
            'inbound_get_participants_type_id',
            'Queries the backend API for the specified party and makes a callback to the originator with our dfspId if found',
            ['success', 'fspId']
        ).startTimer();
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this.backendRequests.getParties(idType, idValue);

            if(!response) {
                histTimerEnd({ success: false });
                return 'No response from backend';
            }

            // make a callback to the source fsp with our dfspId indicating we own the party
            const res = this._mojaloopRequests.putParticipants(idType, idValue, { fspId: this.dfspId },
                sourceFspId);
            histTimerEnd({ success: true });
            return res;
        }
        catch(err) {
            this.logger.push({ err }).log('Error in getParticipantsByTypeAndId');
            const mojaloopError = await this._handleError(err);
            this.logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            const response = await this._mojaloopRequests.putParticipantsError(idType, idValue,
                mojaloopError, sourceFspId);
            histTimerEnd({ success: false });
            return response;
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with the result
     */
    async getParties(idType, idValue, sourceFspId) {
        const histTimerEnd = Metrics.getHistogram(
            'inbound_get_parties',
            'Queries the backend API for the specified party and makes a callback to the originator with the result',
            ['success', 'fspId']
        ).startTimer();
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this.backendRequests.getParties(idType, idValue);

            if(!response) {
                histTimerEnd({ success: false });
                return 'No response from backend';
            }

            // project our internal party representation into a mojaloop partyies request body
            const mlParty = {
                party: shared.internalPartyToMojaloopParty(response, this.dfspId)
            };

            // make a callback to the source fsp with the party info
            const res = this._mojaloopRequests.putParties(idType, idValue, mlParty, sourceFspId);
            histTimerEnd({ success: true });
            return res;
        }
        catch(err) {
            this.logger.push({ err }).log('Error in getParties');
            const mojaloopError = await this._handleError(err);
            this.logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            const response =  await this._mojaloopRequests.putPartiesError(idType, idValue,
                mojaloopError, sourceFspId);
            histTimerEnd({ success: false });
            return response;
        }
    }


    /**
     * Asks the backend for a response to an incoming quote request and makes a callback to the originator with
     * the result
     */
    async quoteRequest(quoteRequest, sourceFspId) {
        const histTimerEnd = Metrics.getHistogram(
            'inbound_quote_request',
            'Asks the backend for a response to an incoming quote request and makes a callback to the originator with the result',
            ['success', 'fspId']
        ).startTimer();
        try {
            const internalForm = shared.mojaloopQuoteRequestToInternal(quoteRequest);

            // make a call to the backend to ask for a quote response
            const response = await this.backendRequests.postQuoteRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                histTimerEnd({ success: false });
                return 'No response from backend';
            }

            if(!response.expiration) {
                const expiration = new Date().getTime() + (this.expirySeconds * 1000);
                response.expiration = new Date(expiration).toISOString();
            }

            // project our internal quote reponse into mojaloop quote response form
            const mojaloopResponse = shared.internalQuoteResponseToMojaloop(response);

            // create our ILP packet and condition and tag them on to our internal quote response
            const { fulfilment, ilpPacket, condition } = this.ilp.getQuoteResponseIlp(quoteRequest, mojaloopResponse);

            mojaloopResponse.ilpPacket = ilpPacket;
            mojaloopResponse.condition = condition;

            // now store the fulfilment and the quote data against the quoteId in our cache
            await this.cache.set(`quote_${quoteRequest.transactionId}`, {
                request: quoteRequest,
                internalRequest: internalForm,
                response: response,
                mojaloopResponse: mojaloopResponse,
                fulfilment: fulfilment
            });

            // make a callback to the source fsp with the quote response
            const res =  this._mojaloopRequests.putQuotes(quoteRequest.quoteId, mojaloopResponse, sourceFspId);
            histTimerEnd({ success: true });
            return res;
        }
        catch(err) {
            this.logger.push({ err }).log('Error in quoteRequest');
            const mojaloopError = await this._handleError(err);
            this.logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            const response = await this._mojaloopRequests.putQuotesError(quoteRequest.quoteId,
                mojaloopError, sourceFspId);
            histTimerEnd({ success: false });
            return response;
        }
    }


    /**
     * Validates  an incoming transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareTransfer(prepareRequest, sourceFspId) {
        const histTimerEnd = Metrics.getHistogram(
            'inbound_prepare_transfers',
            'Validates  an incoming transfer prepare request and makes a callback to the originator with the result',
            ['success', 'fspId']
        ).startTimer();
        try {

            // retrieve our quote data
            const quote = await this.cache.get(`quote_${prepareRequest.transferId}`);

            if(!quote) {
                // Check whether to allow transfers without a previous quote.
                if(!this.allowTransferWithoutQuote) {
                    histTimerEnd({ success: false });
                    throw new Error(`ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`);
                }
            }

            // Calculate or retrieve fullfilment and condition
            let fulfilment = null;
            let condition = null;
            if(quote) {
                fulfilment = quote.fulfilment;
                condition = quote.mojaloopResponse.condition;
            }
            else {
                fulfilment = this.ilp.caluclateFulfil(prepareRequest.ilpPacket);
                condition = this.ilp.calculateConditionFromFulfil(fulfilment);
                console.log({ ilpPacket: prepareRequest.ilpPacket, fulfilment, condition});
            }

            // check incoming ILP matches our persisted values
            if(this.checkIlp && (prepareRequest.condition !== condition)) {
                throw new Error(`ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`);
            }


            if (quote && this.rejectTransfersOnExpiredQuotes) {
                const now = new Date().toISOString();
                const expiration = quote.mojaloopResponse.expiration;
                if (now > expiration) {
                    const error = Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.QUOTE_EXPIRED);
                    this.logger.error(`Error in prepareTransfer: quote expired for transfer ${prepareRequest.transferId}, system time=${now} > quote time=${expiration}`);
                    histTimerEnd({ success: false });
                    return this._mojaloopRequests.putTransfersError(prepareRequest.transferId, error, sourceFspId);
                }
            }

            // project the incoming transfer prepare into an internal transfer request
            const internalForm = shared.mojaloopPrepareToInternalTransfer(prepareRequest, quote);

            // make a call to the backend to inform it of the incoming transfer
            const response = await this.backendRequests.postTransfers(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                histTimerEnd({ success: false });
                return 'No response from backend';
            }

            this.logger.log(`Transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop transferId: ${prepareRequest.transferId}`);

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: new Date(),
                transferState: 'COMMITTED',
                fulfilment: fulfilment
            };

            // make a callback to the source fsp with the transfer fulfilment
            const res = this._mojaloopRequests.putTransfers(prepareRequest.transferId, mojaloopResponse,
                sourceFspId);
            histTimerEnd({ success: true });
            return res;
        }
        catch(err) {
            this.logger.push({ err }).log('Error in prepareTransfer');
            const mojaloopError = await this._handleError(err);
            this.logger.push({ mojaloopError }).log(`Sending error response to ${sourceFspId}`);
            const response = await this._mojaloopRequests.putTransfersError(prepareRequest.transferId,
                mojaloopError, sourceFspId);
            histTimerEnd({ success: false });
            return response;
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
                    this.logger.push({ ex }).log('Error parsing error message body as JSON');
                }
            }

        }

        return new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode).toApiErrorObject();
    }
}


module.exports = InboundTransfersModel;
