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
const { AccountsModel, OutboundTransfersModel, OutboundRequestToPayModel } = require('@internal/model');


/**
 * Common error handling logic
 */
const handleError = (method, err, ctx, stateField) => {
    ctx.state.logger.log(`Error handling ${method}: ${util.inspect(err)}`);
    ctx.response.status = err.httpStatusCode || 500;
    ctx.response.body = {
        message: err.message || 'Unspecified error',
        [stateField]: err[stateField] || {},
        statusCode: (err.httpStatusCode || 500).toString()
    };
    if(err[stateField]
        && err[stateField].lastError
        && err[stateField].lastError.mojaloopError
        && err[stateField].lastError.mojaloopError.errorInformation
        && err[stateField].lastError.mojaloopError.errorInformation.errorCode) {

        ctx.response.body.statusCode = err[stateField].lastError.mojaloopError.errorInformation.errorCode;
    }
};

const handleTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'transferState');

const handleAccountsError = (method, err, ctx) =>
    handleError(method, err, ctx, 'executionState');

const handleRequestToPayError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestToPayState');


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
    catch(err) {
        return handleTransferError('postTransfers', err, ctx);
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
    catch(err) {
        return handleTransferError('putTransfers', err, ctx);
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
    catch(err) {
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

    } catch(err) {
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
        put: putTransfers
    },
    '/accounts': {
        post: postAccounts
    },
    '/requestToPay': {
        post: postRequestToPay
    }
};
