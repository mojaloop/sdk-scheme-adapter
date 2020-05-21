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
const { BackendError } = require('./common');

/**
 *  Models the state machine and operations required for performing an outbound bulk transfer
 */
class OutboundBulkTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;

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
     * Returns a promise that resolves/rejects when the bulk transfer is returned/errored
     */
    async postBulkTransfer(bulkTransferRequest) {
        this.bulkTransferRequest = bulkTransferRequest;

        if (!bulkTransferRequest.hasOwnProperty('bulkTransferId')) {
            bulkTransferRequest.bulkTransferId = uuid();
        }

        return this._requestBulkTransfer();
    }

    /**
     * Requests a bulk transfer
     * Starts the bulk transfer process by sending a POST /bulkTransfers request to the switch;
     * then waits for a notification from the cache that the bulk transfer response has been received.
     */
    async _requestBulkTransfer() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a bulk transfer request
            const bulkTransferPrepare = this._buildBulkTransferPrepareRequest();

            // listen for events on the bulkTransferId
            const bulkTransferKey = `bulkTransfer_${bulkTransferPrepare.bulkTransferId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(bulkTransferKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'bulkTransferFultil') {
                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > bulkTransferPrepare.expiration) {
                                const msg = 'Bulk transfer response missed expiry deadline';
                                error = new BackendError(msg, 504);
                                this._logger.error(`${msg}: system time=${now} > expiration time=${bulkTransferPrepare.expiration}`);
                            }
                        }
                    } else if (message.type === 'bulkTransferFultilError') {
                        error = new BackendError(`Got an error response requesting bulk transfer: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    }
                    else {
                        this._logger.push({ message }).log(`Ignoring cache notification for bulk transfer ${bulkTransferKey}. Unknown message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for bulk transfer resolution messages
                    // no need to await for the unsubscribe to complete.
                    // we dont really care if the unsubscribe fails but we should log it regardless
                    this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const bulkTransferFulfilBody = message.data;
                    this._logger.push({ bulkTransferFulfilBody }).log('Bulk transfer response received');

                    return resolve(bulkTransferFulfilBody);
                }
                catch (err) {
                    return reject(err);
                }
            });

            // set up a timeout for the request
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout waiting for fulfil for bulk transfer ${this.bulkTransferRequest.bulkTransferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /bulkTransfers request to the switch
            try {
                const res = await this._requests.postBulkTransfers(bulkTransferPrepare, this.bulkTransferRequest.to.fspId);
                this._logger.push({ res }).log('Bulk transfer request sent to peer');
            }
            catch (err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(bulkTransferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${bulkTransferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Constructs a bulk transfer request payload
     *
     * @returns {object} - the bulk transfer request object
     */
    _buildBulkTransferPrepareRequest() {
        const bulkTransferRequest = {
            bulkTransferId: this.bulkTransferRequest.bulkTransferId,
            bulkQuoteId: this.bulkTransferRequest.bulkQuoteId,
            payerFsp: this._dfspId,
            payeeFsp: this.bulkTransferRequest.payeeFsp.fspId,
        };

        bulkTransferRequest.expiration = this._getExpirationTimestamp();

        // add extensionList if provided
        if (this.bulkTransferRequest.transferRequestExtensions && this.bulkTransferRequest.transferRequestExtensions.length > 0) {
            bulkTransferRequest.extensionList = {
                extension: this.bulkTransferRequest.transferRequestExtensions
            };
        }

        bulkTransferRequest.individualTransfers = this.bulkTransferRequest.individualTransfers.map((individualTransfer) => {
            const transferId = individualTransfer.transferId || uuid();

            const transferPrepare = {
                transferId: transferId,
                transferAmount: {
                    currency: individualTransfer.currency,
                    amount: individualTransfer.amount
                },
                ilpPacket: individualTransfer.ilpPacket,
                condition: individualTransfer.condition,
            };
            
            if (individualTransfer.extensions && individualTransfer.extensions.length > 0) {
                bulkTransferRequest.extensionList = {
                    extension: individualTransfer.extensions
                };
            }

            return transferPrepare;
        });

        return bulkTransferRequest;
    }
}


module.exports = OutboundBulkTransfersModel;
