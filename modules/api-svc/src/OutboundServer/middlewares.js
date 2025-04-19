/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
const { Enum } = require('@mojaloop/central-services-shared');
const { ReturnCodes } = Enum.Http;
const { ProxyModel } = require('../lib/model');
const {
    applyState,
    createErrorHandler,
    createLogger,
    createRequestIdGenerator,
    createResponseLogging,
    logResponse,
} = require('../InboundServer/middlewares');


/**
 * Add validation for each inbound request
 * @param validator
 * @return {Function}
 */
const createRequestValidator = (validator) => async (ctx, next) => {
    const { logger } = ctx.state;

    if (!ctx.state.logExcludePaths.includes(ctx.path)) {
        logger.isDebugEnabled && logger.debug('Validating request');
    }
    try {
        const matchedPathObject = validator.validateRequest(ctx, logger);
        ctx.state.path = {
            ...matchedPathObject
        };
        if (!ctx.state.logExcludePaths.includes(ctx.path)) {
            logger.isDebugEnabled && logger.debug('Request validation passed');
        }
        await next();
    } catch (err) {
        const { method, path, id } = ctx.request;
        logger.isWarnEnabled && logger.push({ error: err, method, path, id }).warn('Request validation failed');
        ctx.response.status = ReturnCodes.BADREQUEST.CODE;
        ctx.response.body = {
            message: `${err.dataPath ? err.dataPath + ' ' : ''}${err.message}`,
            statusCode: 400
        };
        logResponse(ctx);
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
    createResponseLogging,
};
