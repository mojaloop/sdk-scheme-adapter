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

    async fxQuoteRequest(originalQuoteRequestHeaders, originalQuoteRequest) {
        try {
            const originalQuoteId = originalQuoteRequest.quoteId;
            const originalQuoteSourceFspId = originalQuoteRequestHeaders[FSPIOP_SourceHeader];

            // make a call to the backend to ask for a new quote
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', 'FXP QUOTE Sending request to backend');
            let composedFxpQuoteRequest;
            try {
                composedFxpQuoteRequest = await this.backendRequests.postFxpQuotes(originalQuoteRequest, originalQuoteRequestHeaders);
                if(!composedFxpQuoteRequest) {
                    throw new Error('null response to quote request from FXP backend');
                }
            } catch (error) {
                // make an error callback to the source fsp
                this.logger.log(`Error while expecting response from FXP backend. Making error callback to ${originalQuoteSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(error, error.message, originalQuoteSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putQuotesError(originalQuoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }

            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE Got response from backend: ${JSON.stringify(composedFxpQuoteRequest, null, 2)}`);

            // Now that we got a response, send the quote to the destination DFSP
            const fxpQuoteSourceFspId = composedFxpQuoteRequest.metadata.sourceFSP;
            const fxpQuoteDestinationFspId = composedFxpQuoteRequest.metadata.destinationFSP;

            // BEGIN set up listener to PUT /quotes/{transferId} for the second stage quote
            await this.createFxpQuoteResponseListener(composedFxpQuoteRequest.quote, originalQuoteSourceFspId, originalQuoteRequest);

            // forward the quote to the destination FSP
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE Sending second stage quote to destination DFSP: ${fxpQuoteDestinationFspId}`);

            // MBXFXP-20
            let peerEndpoint = this.config.peerEndpoint; // default
            const configEndpoint = this.config.getDfspEndpoint(fxpQuoteDestinationFspId);
            if (configEndpoint) {
                peerEndpoint = configEndpoint.endpoint;
            }

            const fxpMojaloopRequests = new MojaloopRequests({
                logger: this.logger,
                peerEndpoint: peerEndpoint,
                dfspId: fxpQuoteSourceFspId,
                tls: this.config.tls,
                jwsSign: this.config.jwsSign,
                jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
            });
    
            return fxpMojaloopRequests.postQuotes(composedFxpQuoteRequest.quote, fxpQuoteDestinationFspId);
        }
        catch(err) {
            this.logger.log(`Error in quoteRequest: ${err.stack || util.inspect(err)}`);
            const mojaloopError = await this._handleError(err);
            this.logger.log(`Sending error response : ${util.inspect(mojaloopError)}`);
            // FIXME wrap in a trycatch and log
            return await this.mojaloopRequests.putQuotesError(originalQuoteRequest.quoteId, mojaloopError, '?');
        }
    }


    async createFxpQuoteResponseListener(fxpQuoteRequest, originalQuoteSourceFspId, originalQuoteRequest) {
        const fxpQuoteRequestId = fxpQuoteRequest.quoteId;
        this.subscriber = await this.cache.getClient();
        this.subscriber.subscribe(fxpQuoteRequestId);
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
                return await this.mojaloopRequests.putQuotesError(originalQuoteRequest.quoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }
            if (message.type !== 'quoteResponse') {
                // ignore any message on this subscription that is not a quote response
                this.logger.log(`Ignoring cache notification for transfer ${fxpQuoteRequestId}. Type is not quoteResponse: ${util.inspect(message)}`);
                return;
            }
            const fxpQuoteResponse = message.data;
            const fxpQuoteResponseHeaders = message.headers;
            // cancel the timeout handler
            // clearTimeout(timeout); // FIXME implement timeouts

            // clean quoteId from response if there. The SDK returns it as part of a quote response but it's not part of it per the MOjaloop spec ( FIXME find proper reference )
            delete fxpQuoteResponse['quoteId'];
            console.log('\x1b[47m\x1b[30m%s\x1b[0m',`FXP QUOTE Received response to fxp quote ${JSON.stringify(fxpQuoteResponse, null, 2)}`);
            this.logger.log(`FxpQuote response received: ${util.inspect(fxpQuoteResponse)} with headers: ${util.inspect(fxpQuoteResponseHeaders)}`);
            // stop listening for payee resolution messages
            this.subscriber.unsubscribe(fxpQuoteRequestId, () => {
                this.logger.log('FxpQuote request subscriber unsubscribed');
            });
            // Now send the quote to the FXP
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', 'FXP QUOTE SENDING QUOTE RESPONSE TO BACKEND and asking for response to original quote');
            // forward fxpQuoteResponse to backend; don't change any headers
            let composedResponseToOriginalQuote;
            try {
                composedResponseToOriginalQuote = await self.backendRequests.postFxpQuoteResponse(fxpQuoteRequestId, fxpQuoteResponse, fxpQuoteResponseHeaders);
                if (!composedResponseToOriginalQuote) {
                    throw new Error('Null response from fxp to fxpQuoteResponse');
                }
                // validate composedResponseToOriginalQuote
                //
            }
            catch (error) {
                this.logger.log(`Error from fxp to fxpQuoteResponse. Making error callback to ${originalQuoteSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(error, error.message, originalQuoteSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putQuotesError(originalQuoteRequest.quoteId, err.toApiErrorObject(), originalQuoteSourceFspId);
            }
            // fetch headers from response ( FSPIOP-*, content-type etc) and use them on the PUT below
            const sourceFspId = composedResponseToOriginalQuote.metadata.sourceFSP;
            const destinationFspId = composedResponseToOriginalQuote.metadata.destinationFSP;
            console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP QUOTE SENDING RESPONSE TO ORIGINAL QUOTE TO DFSP1 ${JSON.stringify(composedResponseToOriginalQuote, null, 2)}`);

            const responseToOriginalQuote = composedResponseToOriginalQuote.quoteResponse;

            // Now we create the ilp packet and condition
            // CODE taken from quoteRequest
            if(!responseToOriginalQuote.expiration) {
                const expiration = new Date().getTime() + (this.expirySeconds * 1000);
                responseToOriginalQuote.expiration = new Date(expiration).toISOString();
            }

            // create our ILP packet and condition and tag them on to our internal quote response 
            const { fulfilment, ilpPacket, condition } = this.ilp.getQuoteResponseIlp(fxpQuoteRequest, responseToOriginalQuote);

            responseToOriginalQuote.ilpPacket = ilpPacket;
            responseToOriginalQuote.condition = condition; 

            // now store the fulfilment and the quote data against the quoteId in our cache
            // as we are going to use this on the transfer processing
            await this.cache.set(`quote_${originalQuoteRequest.transactionId}`, {
                // originalQuoteId: responseToOriginalQuote.body.metadata.quoteId,
                originalQuoteRequest: originalQuoteRequest,
                fxpQuoteRequest: fxpQuoteRequest,
                fxpQuoteResponse: fxpQuoteResponse,
                responseToOriginalQuote: responseToOriginalQuote,
                mojaloopResponse: responseToOriginalQuote,
                fulfilment: fulfilment,
                fxpQuote: true
            });

            // make a callback to the source fsp with the quote response

            // MBXFXP-20
            let peerEndpoint = this.config.peerEndpoint; // default
            const configEndpoint = this.config.getDfspEndpoint(destinationFspId);
            if (configEndpoint) {
                peerEndpoint = configEndpoint.endpoint;
            }
            
            // Mojaloop requests picks the quoteId from the body
            responseToOriginalQuote.quoteId = composedResponseToOriginalQuote.metadata.quoteId;

            const fxpMojaloopRequests = new MojaloopRequests({
                logger: this.logger,
                peerEndpoint: peerEndpoint,
                dfspId: sourceFspId,
                tls: this.config.tls,
                jwsSign: this.config.jwsSign,
                jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
            });
            // FIXME wrap in a trycatch
            const putResponse = await fxpMojaloopRequests.putQuotes(responseToOriginalQuote, destinationFspId);
            this.logger.log(`Response from original dfspid to PUT /quotes/{originalQuoteId}: ${util.inspect(putResponse)}`);
        };
        this.subscriber.on('message', fxpQuoteResponseHandler);
    }

    /**
     * Validates  an incoming transfer prepare request and makes a callback to the originator with
     * the result
     */
    async prepareTransfer(prepareRequest, sourceFspId, destinationFspId) {
        try {
            // retrieve our quote data
            const quote = await this.cache.get(`quote_${prepareRequest.transferId}`);

            if (!quote) {
                throw new Error(`Can't process transfer: quote with id ${prepareRequest.transferId} not found`);
            }
            // check incoming ILP matches our persisted values
            if(this.checkIlp && (prepareRequest.condition !== quote.mojaloopResponse.condition)) {
                throw new Error(`ILP condition in transfer prepare for ${prepareRequest.transferId} does not match quote`);
            } 

            if (quote.fxpQuote) {
                return this.fxpTransfer(prepareRequest, sourceFspId, destinationFspId, quote);
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

    async fxpTransfer(prepareRequest, prepareRequestSourceFspId, destinationFspId, quoteData) {
        // get (composed meaning metadata + transfer) fxpTransferRequest from FXP backend
        let composedFxpTransferRequest = await this.getFxpTransferFromBackend(prepareRequest, prepareRequestSourceFspId, destinationFspId);
        let fxpTransferRequest = composedFxpTransferRequest.transfer;

        // FIXME check timeout is less that the one in prepareRequest
        
        // Set the fxpTransferRequest properties
        // FIXME this could also be done by the FXP, since it has the same data. Which place is better?
        fxpTransferRequest.ilpPacket = quoteData.fxpQuoteResponse.ilpPacket;
        fxpTransferRequest.condition = quoteData.fxpQuoteResponse.condition;
        fxpTransferRequest.transferId = quoteData.fxpQuoteRequest.transactionId;

        // Set up a listener before forwarding the fxpTransferRequest
        await this.createFxpTransferResponseListener(prepareRequest, prepareRequestSourceFspId, quoteData, composedFxpTransferRequest);

        // forward it to destination fsp
        await this.forwardFxpTransferToDestination(composedFxpTransferRequest);
    }

    async getFxpTransferFromBackend(prepareRequest, prepareRequestSourceFspId, destinationFspId) {

        let composedTransferRequestResponse;
        try {
            composedTransferRequestResponse = await this.backendRequests.postFxpTransfers(prepareRequest, prepareRequestSourceFspId, destinationFspId);
            if(!composedTransferRequestResponse) {
                throw new Error('null response to transfer request from FXP backend');
            }
        } catch (error) {
            // make an error callback to the source fsp
            this.logger.log(`Error while expecting response from FXP backend. Making error callback to ${prepareRequestSourceFspId}`);
            const err = new Errors.MojaloopFSPIOPError(error, error.message, prepareRequestSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
            // FIXME wrap in a trycatch and log
            return await this.mojaloopRequests.putTransfersError(prepareRequest.transferId, err.toApiErrorObject(), prepareRequestSourceFspId);
        }

        let composedTransferRequest = composedTransferRequestResponse.body;
        console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP transfer Got response from backend: ${JSON.stringify(composedTransferRequest, null, 2)}`);
        return composedTransferRequest;
    }

    async forwardFxpTransferToDestination(composedTransferRequest) {

        // Now that we got a response, send the quote to the destination DFSP
        const fxpQuoteSourceFspId = composedTransferRequest.metadata.sourceFSP;
        const fxpQuoteDestinationFspId = composedTransferRequest.metadata.destinationFSP;

        let peerEndpoint = this.config.peerEndpoint; // default
        const configEndpoint = this.config.getDfspEndpoint(fxpQuoteDestinationFspId);
        if (configEndpoint) {
            peerEndpoint = configEndpoint.endpoint;
        }

        const fxpMojaloopRequests = new MojaloopRequests({
            logger: this.logger,
            peerEndpoint: peerEndpoint,
            dfspId: fxpQuoteSourceFspId,
            tls: this.config.tls,
            jwsSign: this.config.jwsSign,
            jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
        });

        return fxpMojaloopRequests.postTransfers(composedTransferRequest.transfer, fxpQuoteDestinationFspId);
    }

    /**
     * "at this stage you will be notified that the payment would have been fulfilled from the receiving DFSP"
     */
    async createFxpTransferResponseListener(prepareRequest, prepareRequestSourceFspId, quoteData, composedFxpTransferRequest) {
        // listen on composedFxpTransferRequest.transfer.transferId = quoteData.fxpQuoteRequest.transactionId;
        this.subscriber = await this.cache.getClient();
        this.subscriber.subscribe(composedFxpTransferRequest.transfer.transferId);

        const fxpTransferResponseHandler = async (cn, msg) => {
            this.logger.log('fxpTransferResponseHandler received cn and msg: ', cn, msg);
            let message = JSON.parse(msg);
            if (message.type === 'transferError') {
                // this is an error response to our POST /transfers request
                // make an error callback to the source fsp
                this.logger.log(`Error on response to fxpTransfer. Making error callback to ${prepareRequestSourceFspId}`);
                const err = new Errors.MojaloopFSPIOPError(null, message.data, prepareRequestSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
                // FIXME wrap in a trycatch and log
                return await this.mojaloopRequests.putTransfersError(prepareRequest.transferId, err.toApiErrorObject(), prepareRequestSourceFspId);
            }
            if (message.type !== 'transferFulfil') {
                // ignore any message on this subscription that is not a quote response
                this.logger.log(`Ignoring cache notification for transfer ${composedFxpTransferRequest.transfer.transferId}. Type is not quoteResponse: ${util.inspect(message)}`);
                return;
            }

            // cancel the timeout handler
            // clearTimeout(timeout); // FIXME implement timeouts

            const fxpTransferResponse = message.data;
            const fxpTransferResponseHeaders = message.headers;
            
            // We got a response to the fxpTransferRequest
            // fxpTransferResponseHeaders.'fspiop-source' = DFSP2
            // fxpTransferResponseHeaders.'fspiop-destination'= 'DFSP XOF'
            // body:
            // '{
            //     "completedTimestamp":"2019-07-19T20:06:12.287Z",
            //     "transferState":"COMMITTED",
            //     "fulfilment":"AEHj7oqLNuVEL8W1xsxSpVFdncgqbiza_a-hNHS657o"
            //  }',
 
            // 15[B] Log fulfilment has been commited and forward to FXP
            // ( FXP on receiving will perform 16[B] Commit payee transfer)
            let composedTransferFulfilmentResponse = await this.forwardFulfilmentToBackend(fxpTransferResponse, prepareRequestSourceFspId, composedFxpTransferRequest.transfer.transferId, fxpTransferResponseHeaders);

            // 19[A] generate fulfilment
            // Set the fulfilment to be the same we created when making the response to the originalQuote
            // FIXME This could also be set by the FXP, since it also has this data. Which one is better? Data is "more persistent" in backend, here only in memory?
            let composedTransferFulfilment = composedTransferFulfilmentResponse.transferResponse;

            composedTransferFulfilment.fulfilment = quoteData.fulfilment;
            // completedTimestamp, transferState and extensionList are set by the FXP

            // 20A Respond with fulfillment
            // PUT /transfers/{originalId} to the hub
            let originatorFspId = composedTransferFulfilmentResponse.metadata.destinationFSP;
            if (originatorFspId !== prepareRequestSourceFspId) {
                // assertion failed!
                // FIXME send error to which one?
                console.error(`Mismatch between composedTransferFulfilmentResponse.metadata.destinationFSP = ${composedTransferFulfilmentResponse.metadata.destinationFSP} and prepareRequestSourceFspId = ${prepareRequestSourceFspId}`);
            }
            let sendFulfimentToOriginatorFspResponse = await this.sendFulfimentToOriginatorFsp(prepareRequest.transferId, composedTransferFulfilmentResponse);
            console.log('sendFulfimentToOriginatorFsp response', sendFulfimentToOriginatorFspResponse);
            // FIXME catch error and log. retry?
        };
        this.subscriber.on('message', fxpTransferResponseHandler);
    }

    async forwardFulfilmentToBackend(fxpTransferResponse, prepareRequestSourceFspId, transferId, fxpTransferResponseHeaders) {

        let composedTransferFulfilmentResponse;
        try {
            const sourceFSP = fxpTransferResponseHeaders[FSPIOP_SourceHeader];
            const destinationFSP = fxpTransferResponseHeaders[FSPIOP_DestinationHeader];

            composedTransferFulfilmentResponse = await this.backendRequests.postFxpTransferResponse(transferId, fxpTransferResponse, sourceFSP, destinationFSP);
            if(!composedTransferFulfilmentResponse) {
                throw new Error('null response to transfer request from FXP backend'); // FIXME should send a response back to the originatorFsp
            }
        } catch (error) {
            // make an error callback to the source fsp
            this.logger.log(`Error while expecting response from FXP backend. Making error callback to ${prepareRequestSourceFspId}`);
            const err = new Errors.MojaloopFSPIOPError(error, error.message, prepareRequestSourceFspId, Errors.MojaloopApiErrorCodes.PAYEE_ERROR);
            // FIXME wrap in a trycatch and log
            return await this.mojaloopRequests.putTransfersError(transferId, err.toApiErrorObject(), prepareRequestSourceFspId);
        }
        console.log('\x1b[47m\x1b[30m%s\x1b[0m', `FXP transfer Got response from backend: ${JSON.stringify(composedTransferFulfilmentResponse, null, 2)}`);
        return composedTransferFulfilmentResponse;
    }

    async sendFulfimentToOriginatorFsp(transferId, composedTransferFulfilmentResponse) {

        // Now that we got a response, send the fulfilment back to the originator DFSP
        const sourceFspId = composedTransferFulfilmentResponse.metadata.sourceFSP;
        const destinationFspId = composedTransferFulfilmentResponse.metadata.destinationFSP;

        let peerEndpoint = this.config.peerEndpoint; // default
        const configEndpoint = this.config.getDfspEndpoint(destinationFspId);
        if (configEndpoint) {
            peerEndpoint = configEndpoint.endpoint;
        }

        const fxpMojaloopRequests = new MojaloopRequests({
            logger: this.logger,
            peerEndpoint: peerEndpoint,
            dfspId: sourceFspId,
            tls: this.config.tls,
            jwsSign: this.config.jwsSign,
            jwsSigningKey: this.config.jwsSigningKey // FIXME we need to use ONE PRIVATE KEY PER FX DFSP
        });

        return fxpMojaloopRequests.putTransfers(transferId, composedTransferFulfilmentResponse.transferResponse, destinationFspId);
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
