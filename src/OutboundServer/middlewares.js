/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/


const util = require('util');
const randomPhrase = require('@internal/randomphrase');
const { ProxyModel } = require('@internal/model');


/**
 * Log raw to console as a last resort
 * @return {Function}
 */
const createErrorHandler = () => async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        // TODO: return a 500 here if the response has not already been sent?
        console.log(`Error caught in catchall: ${err.stack || util.inspect(err, { depth: 10 })}`);
    }
};


/**
 * Add a log context for each request, log the receipt and handling thereof
 * @param logger
 * @param sharedState
 * @return {Function}
 */
const createLogger = (logger, sharedState) => async (ctx, next) => {
    ctx.state = {
        ...ctx.state,
        ...sharedState,
    };
    ctx.state.logger = logger.push({ request: {
        id: randomPhrase(),
        path: ctx.path,
        method: ctx.method
    }});
    ctx.state.logger.log('Request received');
    try {
        await next();
    } catch (err) {
        ctx.state.logger.push(err).log('Error');
    }
    await ctx.state.logger.log('Request processed');
};


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
            next();
        } else {
            // return the result
            ctx.response.status = response.statusCode;
            ctx.response.body = JSON.parse(response.body);
            ctx.set(response.headers);
        }
    };
};

module.exports = {
    createErrorHandler,
    createLogger,
    createRequestValidator,
    createProxy,
};
