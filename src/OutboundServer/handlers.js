/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 *  CONTRIBUTORS:                                                         *
 *       Steven Oderayi - steven.oderayi@modusbox.com                     *
 **************************************************************************/

'use strict';


const util = require('util');
const {
    AccountsModel,
    OutboundTransfersModel,
    OutboundBulkTransfersModel,
    OutboundRequestToPayTransferModel,
    OutboundRequestToPayModel,
    OutboundBulkQuotesModel,
} = require('@internal/model');


/**
 * Error handling logic shared by outbound API handlers
 */
const handleError = (method, err, ctx, stateField) => {
    ctx.state.logger.log(`Error handling ${method}: ${util.inspect(err)}`);
    ctx.response.status = err.httpStatusCode || 500;
    ctx.response.body = {
        message: err.message || 'Unspecified error',
        [stateField]: err[stateField] || {},
        statusCode: (err.httpStatusCode || 500).toString()
    };
    if (err[stateField]
        && err[stateField].lastError
        && err[stateField].lastError.mojaloopError
        && err[stateField].lastError.mojaloopError.errorInformation
        && err[stateField].lastError.mojaloopError.errorInformation.errorCode) {

        // by default we set the statusCode property of the error body to be that of any model state lastError
        // property containing a mojaloop API error structure. This means the caller does not have to inspect
        // the structure of the response object in depth to ascertain an underlying mojaloop API error code.
        const errorInformation = err[stateField].lastError.mojaloopError.errorInformation;
        ctx.response.body.statusCode = errorInformation.errorCode;

        // if we have been configured to use an error extensionList item as status code, look for it and use
        // it if it is present...
        if (ctx.state.conf.outboundErrorStatusCodeExtensionKey
            && errorInformation.extensionList
            && Array.isArray(errorInformation.extensionList.extension)) {

            // search the extensionList array for a key that matches what we have been configured to look for...
            // the first one will do - spec is a bit loose on duplicate keys...
            const extensionItem = errorInformation.extensionList.extension.find(e => {
                return e.key === ctx.state.conf.outboundErrorStatusCodeExtensionKey;
            });

            if (extensionItem) {
                ctx.response.body.statusCode = extensionItem.value;
            }
        }
    }
};

const handleTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'transferState');

const handleBulkTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'bulkTransferState');

const handleBulkQuoteError = (method, err, ctx) =>
    handleError(method, err, ctx, 'bulkQuoteState');

const handleAccountsError = (method, err, ctx) =>
    handleError(method, err, ctx, 'executionState');

const handleRequestToPayError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestToPayState');

const handleRequestToPayTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestToPayTransferState');


/**
 * Handler for outbound transfer request initiation
 */
const postTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let transferRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundTransfersModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleTransferError('postTransfers', err, ctx);
    }
};

/**
 * Handler for outbound transfer request
 */
const getTransfers = async (ctx) => {
    try {
        let transferRequest = {
            ...ctx.request.body,
            transferId: ctx.state.path.params.transferId,
            currentState: 'getTransfer',
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundTransfersModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleTransferError('getTransfers', err, ctx);
    }
};

/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundTransfersModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // TODO: check the incoming body to reject party or quote when requested to do so

        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transferId);

        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleTransferError('putTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk transfer request
 */
const postBulkTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let bulkTransferRequest = {
            ...ctx.request.body
        };

        // use the bulk transfers model to execute asynchronous stages with the switch
        const model = new OutboundBulkTransfersModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        const response = await model.postBulkTransfer(bulkTransferRequest);

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkTransferError('postBulkTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk transfer request
 */
const getBulkTransfers = async (ctx) => {
    try {
        const bulkTransferId = ctx.state.path.params.bulkTransferId;

        // use the bulk transfers model to execute asynchronous stages with the switch
        const model = new OutboundBulkTransfersModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        const response = await model.getBulkTransfer(bulkTransferId);

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkTransferError('getBulkTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk quote request
 */
const postBulkQuotes = async (ctx) => {
    try {
        let bulkQuoteRequest = {
            ...ctx.request.body
        };

        // use the bulk quotes model to execute asynchronous request with the switch
        const model = new OutboundBulkQuotesModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        const response = await model.postBulkQuote(bulkQuoteRequest);

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkQuoteError('postBulkQuotes', err, ctx);
    }
};

/**
 * Handler for outbound transfer request initiation
 */
const postRequestToPayTransfer = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let requestToPayTransferRequest = {
            ...ctx.request.body
        };

        // use the merchant transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayTransferModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // initialize the transfer model and start it running
        await model.initialize(requestToPayTransferRequest);
        const response = await model.run();
        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleRequestToPayTransferError('postRequestToPayTransfer', err, ctx);
    }
};

/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putRequestToPayTransfer = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayTransferModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // TODO: check the incoming body to reject party or quote when requested to do so
        const data = ctx.request.body;
        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.requestToPayTransactionId);
        let response;
        if (data.acceptQuote === true || data.acceptOTP === true) {
            response = await model.run();
        } else {
            response = await model.rejectRequestToPay();
        }

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleTransferError('putRequestToPayTransfer', err, ctx);
    }
};

/**
 * Handler for outbound participants request initiation
 */
const postAccounts = async (ctx) => {
    try {
        const model = new AccountsModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        const state = {
            accounts: ctx.request.body,
        };

        // initialize the accounts model and run it
        await model.initialize(state);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;
    }
    catch (err) {
        return handleAccountsError('postAccounts', err, ctx);
    }
};

const postRequestToPay = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let requestToPayInboundRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayModel({
            ...ctx.state.conf,
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2Auth: ctx.state.wso2Auth,
        });

        // initialize the transfer model and start it running
        await model.initialize(requestToPayInboundRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        ctx.response.body = response;

    } catch (err) {
        return handleRequestToPayError('requestToPayInboundRequest', err, ctx);
    }
};

const healthCheck = async (ctx) => {
    ctx.response.status = 200;
    ctx.response.body = '';
};

module.exports = {
    '/': {
        get: healthCheck
    },
    '/transfers': {
        post: postTransfers
    },
    '/transfers/{transferId}': {
        get: getTransfers,
        put: putTransfers
    },
    '/bulkTransfers': {
        post: postBulkTransfers
    },
    '/bulkTransfers/{bulkTransferId}': {
        get: getBulkTransfers,
    },
    '/bulkQuotes': {
        post: postBulkQuotes,
    },
    '/accounts': {
        post: postAccounts
    },
    '/requestToPay': {
        post: postRequestToPay
    },
    '/requestToPayTransfer': {
        post: postRequestToPayTransfer
    },
    '/requestToPayTransfer/{requestToPayTransactionId}': {
        put: putRequestToPayTransfer
    },
};
