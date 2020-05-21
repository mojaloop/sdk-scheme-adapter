/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Steven Oderayi - steven.oderayi@modusbox.com                     *
 **************************************************************************/

'use strict';

const util = require('util');
const { uuid } = require('uuidv4');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const shared = require('@internal/shared');
const { BackendError } = require('./common');

/**
 *  Models the state machine and operations required for performing an outbound bulk quote
 */
class OutboundBulkQuotesModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            alsEndpoint: config.alsEndpoint,
            quotesEndpoint: config.quotesEndpoint,
            transfersEndpoint: config.transfersEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSignPutParties: config.jwsSignPutParties,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });
    }

    /**
     * Returns a promise that resolves/rejects when the bulk quote is returned/errored
     */
    async postBulkQuote(bulkQuoteRequest) {
        this.bulkQuoteRequest = bulkQuoteRequest;

        if(!bulkQuoteRequest.hasOwnProperty('bulkQuoteId')) {
            bulkQuoteRequest.bulkQuoteId = uuid();
        }

        return this._requestBulkQuote();
    }

    /**
     * Requests a quote
     * Starts the quote resolution process by sending a POST /quotes request to the switch;
     * then waits for a notification from the cache that the quote response has been received
     */
    async _requestBulkQuote() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a quote request
            const bulkQuote = this._buildBulkQuoteRequest();

            // listen for events on the quoteId
            const bulkQuoteKey = `bulkQuote_${bulkQuote.bulkQuoteId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkQuoteKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkQuoteResponse') {
                        if (this._rejectExpiredQuoteResponses) {
                            const now = new Date().toISOString();
                            if (now > bulkQuote.expiration) {
                                const msg = 'Bulk quote response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.error(`${msg}: system time=${now} > expiration time=${bulkQuote.expiration}`);
                            }
                        }
                    } else if (message.type === 'bulkQuoteResponseError') {
                        error = new BackendError(`Got an error response requesting bulk quote: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    }
                    else {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk quote ${bulkQuoteKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk quote resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkQquoteResponseBody = message.data;
                    this._logger.push({ bulkQquoteResponseBody }).log('Bulk quote response received');

                    return resolve(bulkQuote);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout requesting bulk quote ${this.bulkQuoteRequest.bulkQuoteId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /bulkQuotes request to the switch
            try {
                const res = await this._requests.postBulkQuotes(bulkQuote, this.bulkQuoteRequest.to.fspId);
                this._logger.push({ res }).log('Bulk quote request sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkQuoteKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${bulkQuoteKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Constructs a bulk quote request payload
     *
     * @returns {object} - the bulk quote request object
     */
    _buildBulkQuoteRequest() {
        const bulkQuoteRequest = {
            bulkQuoteId: this.bulkQuoteRequest.bulkQuoteId,
            payer: shared.internalPartyToMojaloopParty(this.bulkQuoteRequest.from, this._dfspId),
        };

        bulkQuoteRequest.expiration = this._getExpirationTimestamp();
        this.bulkQuoteRequest.geoCode && (bulkQuoteRequest.geoCode = this.bulkQuoteRequest.geoCode);
        // add extensionList if provided
        if(this.bulkQuoteRequest.quoteRequestExtensions && this.bulkQuoteRequest.quoteRequestExtensions.length > 0) {
            bulkQuoteRequest.extensionList = {
                extension: this.bulkQuoteRequest.quoteRequestExtensions
            };
        }
        bulkQuoteRequest.individualQuotes = this.bulkQuoteRequest.individualQuotes.map((individualQuote) => {
            const quoteId = individualQuote.quoteId || uuid();
            const quote = {
                quoteId: quoteId,
                transactionId: individualQuote.transactionId || quoteId,
                payee: shared.internalPartyToMojaloopParty(individualQuote.to, individualQuote.to.fspId),
                amountType: individualQuote.amountType,
                amount: {
                    currency: individualQuote.currency,
                    amount: individualQuote.amount
                },
                transactionType : {
                    scenario: individualQuote.transactionType,
                    // TODO: support payee initiated txns?
                    initiator: 'PAYER',
                    // TODO: defaulting to CONSUMER initiator type should
                    // be replaced with a required element on the incoming
                    // API request
                    initiatorType: this.bulkQuoteRequest.from.type || 'CONSUMER'
                }
            };
            individualQuote.note && (quote.note = individualQuote.note);
            if(individualQuote.extensions && individualQuote.extensions.length > 0) {
                bulkQuoteRequest.extensionList = {
                    extension: individualQuote.extensions
                };
            }
    
            return quote;
        });

        return bulkQuoteRequest;
    }
}


module.exports = OutboundBulkQuotesModel;
