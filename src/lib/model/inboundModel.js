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


const util = require('util');
const BackendRequests = require('@internal/requests').BackendRequests;
const HTTPResponseError = require('@internal/requests').HTTPResponseError;
const MojaloopRequests = require('@modusintegration/mojaloop-sdk-standard-components').MojaloopRequests;
const Ilp = require('@modusintegration/mojaloop-sdk-standard-components').Ilp;
const Errors = require('@modusintegration/mojaloop-sdk-standard-components').Errors;
const shared = require('@internal/shared');

const FSPIOP_SourceHeader = 'FSPIOP-Source'.toLowerCase();
const FSPIOP_DestinationHeader = 'FSPIOP-Destination'.toLowerCase();

const ASYNC_TIMEOUT_MILLS = 30000;


/**
 *  Models the operations required for performing inbound transfers
 */
class InboundTransfersModel {
    constructor(config) {
        this.config = config;
        this.cache = config.cache;
        this.logger = config.logger;
        this.ASYNC_TIMEOUT_MILLS = config.asyncTimeoutMillis || ASYNC_TIMEOUT_MILLS;
        this.dfspId = config.dfspId;
        this.expirySeconds = config.expirySeconds;

        this.mojaloopRequests = new MojaloopRequests({
            logger: this.logger,
            peerEndpoint: config.peerEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey
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
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this.backendRequests.getParties(idType, idValue);

            if(!response) {
                // make an error callback to the source fsp
                return `Party not found in backend. Making error callback to ${sourceFspId}`;
            }

            // make a callback to the source fsp with our dfspId indicating we own the party
            return this.mojaloopRequests.putParticipants(idType, idValue, { fspId: this.dfspId },
                sourceFspId);
        }
        catch(err) {
            this.logger.log(`Error in getParticipantsByTypeAndId: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response to ${sourceFspId}: ${util.inspect(mojaloopError)}`);
            return await this.mojaloopRequests.putParticipantsError(idType, idValue,
                mojaloopError, sourceFspId);
        }
    }


    /**
     * Queries the backend API for the specified party and makes a callback to the originator with the result
     */
    async getParties(idType, idValue, sourceFspId) {
        try {
            // make a call to the backend to resolve the party lookup
            const response = await this.backendRequests.getParties(idType, idValue);

            if(!response) {
                // make an error callback to the source fsp
                this.logger.log(`Party not found in backend. Making error callback to ${sourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(null, null, sourceFspId, Errors.MojaloopApiErrorCodes.ID_NOT_FOUND);
                return await this.mojaloopRequests.putPartiesError(idType, idValue,
                    err.toApiErrorObject(), sourceFspId);
            }

            // project our internal party representation into a mojaloop partyies request body
            const mlParty = {
                party: shared.internalPartyToMojaloopParty(response, this.dfspId)
            };

            // make a callback to the source fsp with the party info
            return this.mojaloopRequests.putParties(idType, idValue, mlParty, sourceFspId);
        }
        catch(err) {
            this.logger.log(`Error in getParties: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response to ${sourceFspId}: ${util.inspect(mojaloopError)}`);
            return await this.mojaloopRequests.putPartiesError(idType, idValue,
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
            const response = await this.backendRequests.postQuoteRequests(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return `No quote response from backend. Making error callback to ${sourceFspId}`;
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
            return this.mojaloopRequests.putQuotes(mojaloopResponse, sourceFspId);
        }
        catch(err) {
            this.logger.log(`Error in quoteRequest: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response to ${sourceFspId}: ${util.inspect(mojaloopError)}`);
            return await this.mojaloopRequests.putQuotesError(quoteRequest.quoteId,
                mojaloopError, sourceFspId);
        }
    }

    async fxQuoteRequest(quoteRequestHeaders, quoteRequest) {
        try {
            const originalQuoteId = quoteRequest.quoteId;
            const originalQuoteSourceFspId = quoteRequestHeaders[FSPIOP_SourceHeader];
            // const originalQuoteDestinationFspId = quoteRequestHeaders[FSPIOP_DestinationHeader];

            // make a call to the backend to ask for a new quote
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', 'FXP QUOTE Sending request to backend');
            let response;
            try {
                response = await this.backendRequests.postFxpQuotes(quoteRequest, quoteRequestHeaders);
                if(!response) {
                    throw new Error('null response to quote request from FXP backend');
                }
            } catch (error) {
                // make an error callback to the source fsp
                this.logger.log(`Error while expecting response from FXP backend. Making error callback to ${originalQuoteSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(error, error.message, originalQuoteSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putQuotesError(originalQuoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }

            const composedQuote = response.body;
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE Got response from backend: ${JSON.stringify(composedQuote, null, 2)}`);

            // Now that we got a response, send the quote to the destination DFSP
            const fxpQuoteSourceFspId = composedQuote.metadata.sourceFSP;
            const fxpQuoteDestinationFspId = composedQuote.metadata.destinationFSP;

            // BEGIN set up listener to PUT /quotes/{transferId} for the second stage quote
            await this.secondStageQuoteResponseListener(composedQuote.quote, originalQuoteSourceFspId, originalQuoteId);

            // forward the quote to the destination FSP
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE Sending second stage quote to destination DFSP: ${fxpQuoteDestinationFspId}`);
            const fxpMojaloopRequests = new MojaloopRequests({
                logger: this.logger,
                peerEndpoint: this.config.peerEndpoint,
                dfspId: fxpQuoteSourceFspId,
                tls: this.config.tls,
                jwsSign: this.config.jwsSign,
                jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
            });
    
            return fxpMojaloopRequests.postQuotes(composedQuote.quote, fxpQuoteDestinationFspId);
        }
        catch(err) {
            this.logger.log(`Error in quoteRequest: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response : ${util.inspect(mojaloopError)}`);
            // FIXME wrap in a trycatch and log
            return await this.mojaloopRequests.putQuotesError(quoteRequest.quoteId, mojaloopError, '?');
        }
    }
            

    async secondStageQuoteResponseListener(stage2Quote, originalQuoteSourceFspId, originalQuoteId) {
        const quoteId = stage2Quote.quoteId;
        this.subscriber = await this.cache.getClient();
        this.subscriber.subscribe(quoteId);
        let self = this;
        const fxpQuoteResponseHandler = async (cn, msg) => {
            this.logger.log('quoteResponseHandler received cn and msg: ', cn, msg);
            let message = JSON.parse(msg);
            if (message.type === 'quoteResponseError') {
                // this is an error response to our POST /quotes request
                // make an error callback to the source fsp
                this.logger.log(`Error on response to fxpQuote. Making error callback to ${originalQuoteSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(null, message.data, originalQuoteSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putQuotesError(originalQuoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }
            if (message.type !== 'quoteResponse') {
                // ignore any message on this subscription that is not a quote response
                this.logger.log(`Ignoring cache notification for transfer ${quoteId}. Type is not quoteResponse: ${util.inspect(message)}`);
                return;
            }
            const quoteResponse = message.data;
            const quoteResponseHeaders = message.headers;
            // cancel the timeout handler
            // clearTimeout(timeout); // FIXME timeouts
            console.log('\x1b[47m\x1b[30m%s\x1b[0m',`FXP QUOTE Received response to second stage quote ${JSON.stringify(quoteResponse, null, 2)}`);
            this.logger.log(`Quote response received: ${util.inspect(quoteResponse)} with headers: ${util.inspect(quoteResponseHeaders)}`);
            // stop listening for payee resolution messages
            this.subscriber.unsubscribe(quoteId, () => {
                this.logger.log('Quote request subscriber unsubscribed');
            });
            // Now send the quote to the FXP
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', 'FXP QUOTE SENDING QUOTE RESPONSE TO BACKEND and asking for response to original quote');
            // forwar quoteResponse to backend; don't change any headers
            let responseToOriginalQuote;
            try {
                responseToOriginalQuote = await self.backendRequests.postFxpQuote(originalQuoteId, quoteResponse, quoteResponseHeaders);
                if (!responseToOriginalQuote) {
                    throw new Error('Null response from fxp to fxpQuoteResponse');
                }
                // validate responseToOriginalQuote.body
                //
            }
            catch (error) {
                this.logger.log(`Error from fxp to fxpQuoteResponse. Making error callback to ${originalQuoteSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(error, error.message, originalQuoteSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putQuotesError(originalQuoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }
            // fetch headers from response ( FSPIOP-*, content-type etc) and use them on the PUT below
            const sourceFspId = responseToOriginalQuote.body.metadata.sourceFSP;
            const destinationFspId = responseToOriginalQuote.body.metadata.destinationFSP;
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE SENDING RESPONSE TO ORIGINAL QUOTE TO DFSP1 ${JSON.stringify(responseToOriginalQuote.body, null, 2)}`);
            const fxpMojaloopRequests = new MojaloopRequests({
                logger: this.logger,
                peerEndpoint: this.config.peerEndpoint,
                dfspId: sourceFspId,
                tls: this.config.tls,
                jwsSign: this.config.jwsSign,
                jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
            });
            // FIXME wrap in a trycatch
            const putResponse = await fxpMojaloopRequests.putQuotes(responseToOriginalQuote.body.quoteResponse, destinationFspId);
            this.logger.log(`Response from original dfspid to PUT /quotes/{originalQuoteId}: ${util.inspect(putResponse)}`);
        };
        this.subscriber.on('message', fxpQuoteResponseHandler);
    }

    /**
     * Validates  an incoming transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareTransfer(prepareRequest, sourceFspId) {
        try {
            // retrieve our quote data
            const quote = await this.cache.get(`quote_${prepareRequest.transferId}`);

            // check incoming ILP matches our persisted values
            if(this.checkIlp && (prepareRequest.condition !== quote.mojaloopResponse.condition)) {
                throw new Error(`ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`);
            } 

            // project the incoming transfer prepare into an internal transfer request
            const internalForm = shared.mojaloopPrepareToInternalTransfer(prepareRequest, quote);

            // make a call to the backend to inform it of the incoming transfer
            const response = await this.backendRequests.postTransfers(internalForm);

            if(!response) {
                // make an error callback to the source fsp
                return `No transfer response from backend. Making error callback to ${sourceFspId}`;
            }

            this.logger.log(`Transfer accepted by backend returning homeTransactionId: ${response.homeTransactionId} for mojaloop transferId: ${prepareRequest.transferId}`);

            // create a  mojaloop transfer fulfil response
            const mojaloopResponse = {
                completedTimestamp: new Date(),
                transferState: 'COMMITTED',
                fulfilment: quote.fulfilment
            };

            // make a callback to the source fsp with the transfer fulfilment
            return this.mojaloopRequests.putTransfers(prepareRequest.transferId, mojaloopResponse,
                sourceFspId);
        }
        catch(err) {
            this.logger.log(`Error in prepareTransfer: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response to ${sourceFspId}: ${util.inspect(mojaloopError)}`);
            return await this.mojaloopRequests.putTransfersError(prepareRequest.transferId,
                mojaloopError, sourceFspId);
        }
    }

    async _handleError(err) {
        if(err instanceof HTTPResponseError ) {
            const e = err.getData();
            let mojaloopErrorCode = Errors.MojaloopApiErrorCodes.INTERNAL_SERVER_ERROR;

            if(e.res && e.res.body) {
                try {
                    const bodyObj = JSON.parse(e.res.body);
                    mojaloopErrorCode = Errors.MojaloopApiErrorCodeFromCode(`${bodyObj.statusCode}`);
                }
                catch(ex) {
                    // do nothing
                    this.logger.log(`Error parsing error message body as JSON: ${ex.stack || util.inspect(ex)}`);
                }
            }

            return new Errors.MojaloopFSPIOPError(err, null, null, mojaloopErrorCode).toApiErrorObject();
        }

        // rethrow some other type of error
        // Changed to return so we can return an answer to the original sender
        throw err;
        // return err;
    }
}


module.exports = InboundTransfersModel;
