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
const { Ilp, MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { BackendError } = require('./common');

const transferStateEnum = {
    'WAITING_FOR_PARTY_ACEPTANCE': 'WAITING_FOR_PARTY_ACCEPTANCE',
    'WAITING_FOR_QUOTE_ACCEPTANCE': 'WAITING_FOR_QUOTE_ACCEPTANCE',
    'ERROR_OCCURRED': 'ERROR_OCCURRED',
    'COMPLETED': 'COMPLETED',
};

/**
 *  Models the state machine and operations required for performing an outbound bulk transfer
 */
class OutboundBulkTransfersModel {
    constructor(config) {
        this._cache = config.cache;
        this._logger = config.logger;
        this._requestProcessingTimeoutSeconds = config.requestProcessingTimeoutSeconds;
        this._dfspId = config.dfspId;
        this._expirySeconds = config.expirySeconds;
        this._rejectExpiredQuoteResponses = config.rejectExpiredQuoteResponses;
        this._rejectExpiredTransferFulfils = config.rejectExpiredTransferFulfils;
        this._autoAcceptQuotes = config.autoAcceptQuotes;
        this._autoAcceptParty = config.autoAcceptParty;
        this._useQuoteSourceFSPAsTransferPayeeFSP = config.useQuoteSourceFSPAsTransferPayeeFSP;
        this._checkIlp = config.checkIlp;

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

        this._ilp = new Ilp({
            secret: config.ilpSecret
        });
    }

    /**
     * Initializes the bulk transfer model
     *
     * @param data {object} - The inbound API POST /bulkTransfers request body
     */
    initialize(data) {
        this.data = data;

        // add a bulkTransferId if one is not present e.g. on first submission
        if(!this.data.hasOwnProperty('bulkTransferId')) {
            this.data.bulkTransferId = uuid();
        }
    }

    /**
     * Executes a transfer
     * Starts the transfer process by sending a POST /transfers (prepare) request to the switch;
     * then waits for a notification from the cache that the transfer has been fulfilled
     */
    async _executeBulkTransfer() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            // create a transfer prepare request
            const prepare = this._buildTransferPrepare();

            // listen for events on the bulkTransferId
            const transferKey = `tf_${this.data.bulkTransferId}`;

            const subId = await this._cache.subscribe(transferKey, async (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transferFulfil') {
                        if (this._rejectExpiredTransferFulfils) {
                            const now = new Date().toISOString();
                            if (now > prepare.expiration) {
                                const msg = 'Transfer fulfil missed expiry deadline';
                                this._logger.error(`${msg}: system time=${now} > expiration=${prepare.expiration}`);
                                error = new BackendError(msg, 504);
                            }
                        }
                    } else if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response preparing transfer: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    } else {
                        this._logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this._logger.push({ fulfil }).log('Transfer fulfil received');
                    this.data.fulfil = fulfil;

                    if(this._checkIlp && !this._ilp.validateFulfil(fulfil.fulfilment, this.data.quoteResponse.condition)) {
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
                const err = new BackendError(`Timeout waiting for fulfil for transfer ${this.data.bulkTransferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a POST /transfers request to the switch
            try {
                const res = await this._requests.postTransfers(prepare, this.data.quoteResponseSource);
                this._logger.push({ res }).log('Transfer prepare sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in error handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }
        });
    }

    /**
     * Get transfer details by sending GET /transfers request to the switch
     */
    async _getBulkTransfer() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const transferKey = `tf_${this.data.bulkTransferId}`;

            // hook up a subscriber to handle response messages
            const subId = await this._cache.subscribe(transferKey, (cn, msg, subId) => {
                try {
                    let error;
                    let message = JSON.parse(msg);

                    if (message.type === 'transferError') {
                        error = new BackendError(`Got an error response retrieving transfer: ${util.inspect(message.data, { depth: Infinity })}`, 500);
                        error.mojaloopError = message.data;
                    } else if (message.type !== 'transferFulfil') {
                        this._logger.push({ message }).log(`Ignoring cache notification for transfer ${transferKey}. Uknokwn message type ${message.type}.`);
                        return;
                    }

                    // cancel the timeout handler
                    clearTimeout(timeout);

                    // stop listening for transfer fulfil messages
                    this._cache.unsubscribe(transferKey, subId).catch(e => {
                        this._logger.log(`Error unsubscribing (in callback) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                    });

                    if (error) {
                        return reject(error);
                    }

                    const fulfil = message.data;
                    this._logger.push({ fulfil }).log('Transfer fulfil received');
                    this.data.fulfil = fulfil;

                    return resolve(this.data);
                }
                catch(err) {
                    return reject(err);
                }
            });

            // set up a timeout for the resolution
            const timeout = setTimeout(() => {
                const err = new BackendError(`Timeout getting transfer ${this.data.bulkTransferId}`, 504);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing (in timeout handler) ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
                });

                return reject(err);
            }, this._requestProcessingTimeoutSeconds * 1000);

            // now we have a timeout handler and a cache subscriber hooked up we can fire off
            // a GET /transfers request to the switch
            try {
                const res = await this._requests.getBulkTransfers(this.data.bulkTransferId);
                this._logger.push({ peer: res }).log('Transfer lookup sent to peer');
            }
            catch(err) {
                // cancel the timout and unsubscribe before rejecting the promise
                clearTimeout(timeout);

                // we dont really care if the unsubscribe fails but we should log it regardless
                this._cache.unsubscribe(transferKey, subId).catch(e => {
                    this._logger.log(`Error unsubscribing ${transferKey} ${subId}: ${e.stack || util.inspect(e)}`);
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
            bulkTransferId: this.data.bulkTransferId,
            payeeFsp: this.data.to.fspId,
            payerFsp: this._dfspId,
            amount: {
                // We use the transfer currency and amount specified in the quote response
                // rather than the original request. In Forex cases we may have requested
                // a RECEIVE amount in a currency we cannot send. FXP should always give us
                // a quote response with transferAmount in the correct currency.
                currency: this.data.quoteResponse.transferAmount.currency,
                amount: this.data.quoteResponse.transferAmount.amount
            },
            ilpPacket: this.data.quoteResponse.ilpPacket,
            condition: this.data.quoteResponse.condition,
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
            case 'payeesResolved':
                resp.currentState = transferStateEnum.WAITING_FOR_PARTY_ACEPTANCE;
                break;

            case 'quotesReceived':
                resp.currentState = transferStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE;
                break;

            case 'succeeded':
                resp.currentState = transferStateEnum.COMPLETED;
                break;

            case 'errored':
                resp.currentState = transferStateEnum.ERROR_OCCURRED;
                break;

            default:
                this._logger.log(`Transfer model response being returned from an unexpected state: ${this.data.currentState}. Returning ERROR_OCCURRED state`);
                resp.currentState = transferStateEnum.ERROR_OCCURRED;
                break;
        }

        return resp;
    }

    /**
     * Returns a promise that resolves when the state machine has reached a terminal state
     */
    async run() {
        try {
            // run transitions based on incoming state
            switch(this.data.currentState) {
                case 'start':
                    // next transition is to resolvePayees
                    await this.stateMachine.resolvePayees();
                    this._logger.log(`Payee resolved for transfer ${this.data.bulkTransferId}`);
                    if(this.stateMachine.state === 'payeesResolved' && !this._autoAcceptParty) {
                        //we break execution here and return the resolved party details to allow asynchronous accept or reject
                        //of the resolved party
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'payeesResolved':
                    // next transition is to requestBulkQuote
                    await this.stateMachine.requestBulkQuote();
                    this._logger.log(`Quote received for transfer ${this.data.bulkTransferId}`);
                    if(this.stateMachine.state === 'quotesReceived' && !this._autoAcceptQuotes) {
                        //we break execution here and return the quote response details to allow asynchronous accept or reject
                        //of the quote
                        await this._save();
                        return this.getResponse();
                    }
                    break;

                case 'quotesReceived':
                    // next transition is executeBulkTransfer
                    await this.stateMachine.executeBulkTransfer();
                    this._logger.log(`Transfer ${this.data.bulkTransferId} has been completed`);
                    break;

                case 'getBulkTransfer':
                    await this.stateMachine.getBulkTransfer();
                    this._logger.log(`Get transfer ${this.data.bulkTransferId} has been completed`);
                    break;

                case 'succeeded':
                    // all steps complete so return
                    this._logger.log('Transfer completed successfully');
                    await this._save();
                    return this.getResponse();

                case 'errored':
                    // stopped in errored state
                    this._logger.log('State machine in errored state');
                    return;
            }

            // now call ourslves recursively to deal with the next transition
            this._logger.log(`Transfer model state machine transition completed in state: ${this.stateMachine.state}. Recusring to handle next transition.`);
            return this.run();
        }
        catch(err) {
            this._logger.log(`Error running transfer model: ${util.inspect(err)}`);

            // as this function is recursive, we dont want to error the state machine multiple times
            if(this.data.currentState !== 'errored') {
                // err should not have a transferState property here!
                if(err.transferState) {
                    this._logger.log(`State machine is broken: ${util.inspect(err)}`);
                }
                // transition to errored state
                await this.stateMachine.error(err);

                // avoid circular ref between transferState.lastError and err
                err.transferState = JSON.parse(JSON.stringify(this.getResponse()));
            }
            throw err;
        }
    }
}


module.exports = OutboundBulkTransfersModel;
