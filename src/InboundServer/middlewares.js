/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

const coBody = require('co-body');

const randomPhrase = require('../lib/randomphrase');
const { Jws, Errors } = require('@mojaloop/sdk-standard-components');

/**
 * Log raw to console as a last resort
 * @return {Function}
 */
const createErrorHandler = (logger) => async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        // TODO: return a 500 here if the response has not already been sent?
        logger.push({ err }).log('Error caught in catchall');
    }
};


/**
 * tag each incoming request with the FSPIOP identifier from it's path or body
 * @return {Function}
 */
const assignFspiopIdentifier = () => async (ctx, next) => {
    const getters = {
        '/authorizations/{ID}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/bulkQuotes': {
            post: () => ctx.request.body.bulkQuoteId,
        },
        '/bulkQuotes/{ID}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/bulkQuotes/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/bulkTransfers': {
            post: () => ctx.request.body.bulkTransferId,
        },
        '/bulkTransfers/{ID}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/bulkTransfers/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/participants/{ID}': {
            put: () => ctx.state.path.params.ID,
        },
        '/participants/{Type}/{ID}': {
            get: () => ctx.state.path.params.ID,
        },
        '/participants/{Type}/{ID}/{SubId}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/participants/{Type}/{ID}/{SubId}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/participants/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/parties/{Type}/{ID}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/parties/{Type}/{ID}/{SubId}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
        },
        '/parties/{Type}/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/parties/{Type}/{ID}/{SubId}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/quotes': {
            post: () => ctx.request.body.quoteId,
        },
        '/quotes/{ID}': {
            put: () => ctx.state.path.params.ID,
        },
        '/quotes/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/transfers': {
            post: () => ctx.request.body.transferId,
        },
        '/transfers/{ID}': {
            get: () => ctx.state.path.params.ID,
            put: () => ctx.state.path.params.ID,
            patch: () => ctx.state.path.params.ID,
        },
        '/transfers/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/transactionRequests': {
            post: () => ctx.request.body.transactionRequestId,
        },
        '/transactionRequests/{ID}': {
            put: () => ctx.state.path.params.ID,
        }
    }[ctx.state.path.pattern];
    if (getters) {
        const getter = getters[ctx.method.toLowerCase()];
        if (getter) {
            ctx.state.fspiopId = getter(ctx.request);
        }
    }
    await next();
};


/**
 * cache incoming requests and callbacks
 * @return {Function}
 */
const cacheRequest = (cache) => async (ctx, next) => {
    if (ctx.state.fspiopId) {
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body,
        };
        const prefix = ctx.method.toLowerCase() === 'put' ? cache.CALLBACK_PREFIX : cache.REQUEST_PREFIX;
        const res = await cache.set(`${prefix}${ctx.state.fspiopId}`, req);
        ctx.state.logger.push({ res }).log('Caching request');
    }
    await next();
};


/**
 * tag each incoming request with a unique identifier
 * @return {Function}
 */
const createRequestIdGenerator = () => async (ctx, next) => {
    ctx.request.id = randomPhrase();
    await next();
};


/**
 * Deal with mojaloop API content type headers, treat as JSON
 * @param logger
 * @return {Function}
 */
//
const createHeaderValidator = (logger) => async (ctx, next) => {
    const validHeaders = new Set([
        'application/vnd.interoperability.parties+json;version=1.0',
        'application/vnd.interoperability.parties+json;version=1.1',
        'application/vnd.interoperability.participants+json;version=1.0',
        'application/vnd.interoperability.quotes+json;version=1.0',
        'application/vnd.interoperability.quotes+json;version=1.1',
        'application/vnd.interoperability.bulkQuotes+json;version=1.0',
        'application/vnd.interoperability.bulkQuotes+json;version=1.1',
        'application/vnd.interoperability.bulkTransfers+json;version=1.0',
        'application/vnd.interoperability.transactionRequests+json;version=1.0',
        'application/vnd.interoperability.transfers+json;version=1.0',
        'application/vnd.interoperability.transfers+json;version=1.1',
        'application/vnd.interoperability.authorizations+json;version=1.0'
    ]);
    if (validHeaders.has(ctx.request.headers['content-type'])) {
        try {
            ctx.request.body = await coBody.json(ctx.req);
        }
        catch(err) {
            // error parsing body
            logger.push({ err }).log('Error parsing body');
            ctx.response.status = Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode;
            ctx.response.body = new Errors.MojaloopFSPIOPError(err, err.message, null,
                Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX).toApiErrorObject();
            return;
        }
    } else { // We must deal with invalid content-type header
        const err = new Errors.MojaloopFSPIOPError(
            null, 
            `Invalid header content-type: ${ctx.request.headers['content-type']}`, 
            null,
            Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION);
        // overwrite the default error message with something more useful
        err.apiErrorCode.message = `${err.apiErrorCode.message} - ${err.message}`;

        logger.push({ err }).log('Error validating requested content-type header');
        ctx.response.status = Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION.httpStatusCode;
        ctx.response.body = err.toApiErrorObject();
        return;
    }
    await next();
};


/**
 *
 * @param logger
 * @param keys {Object}  JWS verification keys
 * @param exclusions {string[]} Requests to exclude from validation. Possible values: "putParties"
 * @return {Function}
 */
const createJwsValidator = (logger, keys, exclusions) => {
    const jwsValidator = new Jws.validator({
        logger: logger,
        validationKeys: keys,
    });
    // JWS validation for incoming requests
    return async (ctx, next) => {
        try {
            // we skip inbound JWS validation on PUT /parties requests if our config flag
            // is set to do so.
            if (exclusions.includes('putParties')
                    && ctx.request.method === 'PUT'
                    && ctx.request.path.startsWith('/parties/')) {
                logger.log('Skipping jws validation on put parties. config flag is set');
                return await next();
            }

            // we dont check signatures on GET requests
            // todo: validate this requirement. No state is mutated by GETs but
            // there are potential security issues if message origin is used to
            // determine permission sets i.e. what is "readable"
            if(ctx.request.method !== 'GET') {
                logger.push({ request: ctx.request, body: ctx.request.body }).log('Validating JWS');
                jwsValidator.validate(ctx.request, logger);
            }

        }
        catch(err) {
            logger.push({ err }).log('Inbound request failed JWS validation');

            ctx.response.status = 400;
            ctx.response.body = new Errors.MojaloopFSPIOPError(
                err, err.message, null, Errors.MojaloopApiErrorCodes.INVALID_SIGNATURE
            ).toApiErrorObject();
            return;
        }
        await next();
    };
};


/**
 * Add request state.
 * TODO: this should probably be app context:
 * https://github.com/koajs/koa/blob/master/docs/api/index.md#appcontext
 * @param sharedState
 * @return {Function}
 */
const applyState = (sharedState) => async (ctx, next) => {
    Object.assign(ctx.state, {
        ...sharedState,
        conf: {
            ...sharedState.conf,
            tls: sharedState?.conf?.mutualTLS?.outboundRequests,
        }
    });
    await next();
};


/**
 * Add a log context for each request, log the receipt and handling thereof
 * @param logger
 * @return {Function}
 */
const createLogger = (logger) => async (ctx, next) => {
    ctx.state.logger = logger.push({ request: {
        id: ctx.request.id,
        path: ctx.path,
        method: ctx.method
    }});
    ctx.state.logger.push({ body: ctx.request.body }).log('Request received');
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
        // send a mojaloop spec error response
        ctx.response.status = err.httpStatusCode || 400;

        if(err instanceof Errors.MojaloopFSPIOPError) {
            // this is a specific mojaloop spec error
            ctx.response.body = err.toApiErrorObject();
            return;
        }

        // generic mojaloop spec validation error
        ctx.response.body = {
            errorInformation: {
                errorCode: '3100',
                errorDescription: `${err.dataPath ? err.dataPath + ' ' : ''}${err.message}`
            }
        };
    }
};


/**
 * Override Koa's default behaviour of returning the status code as text in the body. If we
 * haven't defined the body, we want it empty. Note that if setting this to null, Koa appears
 * to override the status code with a 204. This is correct behaviour in the sense that the
 * status code correctly corresponds to the content (none) but unfortunately the Mojaloop API
 * does not respect this convention and requires a 200.
 * @return {Function}
 */
const createResponseBodyHandler = () => async (ctx, next) => {
    if (ctx.response.body === undefined) {
        ctx.response.body = '';
    }
    return await next();
};


module.exports = {
    applyState,
    assignFspiopIdentifier,
    cacheRequest,
    createErrorHandler,
    createRequestIdGenerator,
    createHeaderValidator,
    createJwsValidator,
    createLogger,
    createRequestValidator,
    createResponseBodyHandler,
};
