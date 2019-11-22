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
const { AccountsModel, OutboundTransfersModel } = require('@internal/model');
const Metrics = require('@mojaloop/central-services-metrics');


/**
 * Common error handling logic
 */
const handleError = (method, err, ctx, stateField) => {
    ctx.state.logger.log(`Error handling ${method}: ${util.inspect(err)}`);
    ctx.response.status = err.httpStatusCode || 500;
    ctx.response.body = {
        message: err.message || 'Unspecified error',
        [stateField]: err[stateField] || {},
        statusCode: err.httpStatusCode || 500
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


/**
 * Handler for outbound transfer request initiation
 */
const postTransfers = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'outbound_post_transfers',
        'Get participants details to complete a quote and get a completed transfer synchronously',
        ['success', 'fspId']
    ).startTimer();
    const span = ctx.request.span;
    try {
        // this requires a multi-stage sequence with the switch.
        let transferRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundTransfersModel({
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            span,
            headers: ctx.request.headers,
            ...ctx.state.conf
        });

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        histTimerEnd({ success: true });
        ctx.response.body = response;
    }
    catch(err) {
        histTimerEnd({ success: false });
        return handleTransferError('postTransfers', err, ctx);
    }
};



/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putTransfers = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'outbound_put_transfers',
        'Handler for resuming outbound transfers in scenarios where two-step transfers are enabled',
        ['success', 'fspId']
    ).startTimer();
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundTransfersModel({
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            ...ctx.state.conf
        });

        // TODO: check the incoming body to reject party or quote when requested to do so

        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transferId);

        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        histTimerEnd({ success: true });
        ctx.response.body = response;
    }
    catch(err) {
        histTimerEnd({ success: false });
        return handleTransferError('putTransfers', err, ctx);
    }
};


/**
 * Handler for outbound participants request initiation
 */
const postAccounts = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'outbound_post_accounts',
        'Handler for outbound participants request initiation',
        ['success', 'fspId']
    ).startTimer();
    try {
        const model = new AccountsModel({
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            ...ctx.state.conf
        });

        const state = {
            accounts: ctx.request.body,
        };

        // initialize the accounts model and run it
        await model.initialize(state);
        const response = await model.run();

        // return the result
        ctx.response.status = 200;
        histTimerEnd({ success: true });
        ctx.response.body = response;
    }
    catch(err) {
        histTimerEnd({ success: false });
        return handleAccountsError('postAccounts', err, ctx);
    }
};


const healthCheck = async (ctx) => {
    ctx.response.status = 200;
    ctx.response.body = '';
};

const metrics = async (ctx) => {
    ctx.response.status = 200;
    ctx.response.body = Metrics.getMetricsForPrometheus();
};

module.exports = {
    map: {
        '/': {
            get: {
                handler: healthCheck,
                id: 'outbound_health_check',
                enableSpan: false
            }
        },
        '/transfers': {
            post: {
                handler: postTransfers,
                id: 'outbound_post_transfers',
                enableSpan: true
            }
        },
        '/transfers/{transferId}': {
            put: {
                handler: putTransfers,
                id: 'outbound_put_transfers',
                enableSpan: true
            }
        },
        '/accounts': {
            post: {
                handler: postAccounts,
                id: 'outbound_post_accounts',
                enableSpan: true
            }
        },
        '/metrics': {
            get: {
                handler: metrics,
                id: 'outbound_get_metrics',
                enableSpan: false
            }
        }
    }
};
