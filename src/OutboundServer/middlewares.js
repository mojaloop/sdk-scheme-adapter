/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/


const { ProxyModel } = require('@internal/model');
const { applyState, createErrorHandler, createLogger, createRequestIdGenerator } =
    require('../InboundServer/middlewares');


/**
 * Add validation for each inbound request
 * @param validator
 * @return {Function}
 */
const createRequestValidator = (validator) => async (ctx, next) => {
    ctx.state.logger.log('Validating request');
    try {
        ctx.state.path = validator.validateRequest(ctx, ctx.state.logger);
        ctx.state.logger.log('Request passed validation');
        await next();
    } catch (err) {
        ctx.state.logger.push({ err }).log('Request failed validation.');
        ctx.response.status = 400;
        ctx.response.body = {
            message: `${err.dataPath ? err.dataPath + ' ' : ''}${err.message}`,
            statusCode: 400
        };
    }
};

/**
 * Create proxy middleware for forwarding matching DFSP requests
 * (from provided routing rules) to corresponding switch endpoint
 * @param opts
 * @return {Function}
 */
const createProxy = (opts) => {
    const proxy = new ProxyModel(opts);
    return async (ctx, next) => {
        const response = await proxy.proxyRequest(ctx.request);
        if (response === undefined) {
            // Skip proxying request
            await next();
        } else {
            // return the result
            ctx.response.status = response.statusCode;
            ctx.response.body = response.data;
            ctx.set(response.headers);
        }
    };
};

module.exports = {
    applyState,
    createRequestIdGenerator,
    createErrorHandler,
    createLogger,
    createRequestValidator,
    createProxy,
};
