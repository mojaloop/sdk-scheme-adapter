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
 - James Bush <james.bus@mojaloop.io>

 --------------
 ******/
const { env } = require('node:process');
const { generateSlug } = require('random-word-slugs');
const coBody = require('co-body');

const { Jws, Errors, common } = require('@mojaloop/sdk-standard-components');
const { ReturnCodes } = require('@mojaloop/central-services-shared').Enum.Http;
const {
    parseAcceptHeader,
    parseContentTypeHeader,
    protocolVersionsMap
} = require('@mojaloop/central-services-shared').Util.HeaderValidation;
const {
    defaultProtocolResources,
    defaultProtocolVersions,
    errorMessages
} = require('@mojaloop/central-services-shared').Util.Hapi.FSPIOPHeaderValidation;
const { TransformFacades } = require('@mojaloop/ml-schema-transformer-lib');

const { transformHeadersIsoToFspiop } = require('../lib/utils');
const { API_TYPES } = require('../constants');
const Config = require('../config');

const INTERNAL_ROUTES = env.LOG_INTERNAL_ROUTES ? env.LOG_INTERNAL_ROUTES.split(',') : ['/health', '/metrics', '/ready'];
const shouldLog = (path, log) => log.isInfoEnabled && !INTERNAL_ROUTES.includes(path);

/**
 * Log raw to console as a last resort
 * @return {Function}
 */
const createErrorHandler = (logger) => async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        // TODO: return a 500 here if the response has not already been sent?
        logger.error('Error caught in catchall: ', err);
    }
};


/**
 * tag each incoming request with the FSPIOP identifier from its path or body
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
            post: () => ctx.request.body.quoteId || ctx.request.body.CdtTrfTxInf.PmtId.TxId,
        },
        '/quotes/{ID}': {
            put: () => ctx.state.path.params.ID,
        },
        '/quotes/{ID}/error': {
            put: () => ctx.state.path.params.ID,
        },
        '/transfers': {
            post: () => ctx.request.body.transferId || ctx.request.body.CdtTrfTxInf.PmtId.TxId,
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
        },
        '/fxQuotes': {
            post: () => ctx.request.body.conversionRequestId || ctx.request.body.CdtTrfTxInf.PmtId.TxId,
        },
        '/fxTransfers': {
            post: () => ctx.request.body.commitRequestId || ctx.request.body.CdtTrfTxInf.PmtId.TxId,
        },
    }[ctx.state.path.pattern];

    if (getters) {
        const getter = getters[ctx.method.toLowerCase()];
        if (getter) {
            if (Config.apiType === API_TYPES.iso20022
            ) {
                try {
                    const transformOpts = {
                        headers: ctx.request.headers,
                        body: ctx.request.body,
                        params: ctx.state.path.params
                    };
                    const isError = ctx.state.path.pattern.endsWith('error');
                    const resourceType = ctx.state.path.pattern.split('/')[1];
                    let fspiopBody = {};
                    if (ctx.method.toLowerCase() !== 'get' &&
                        ctx.method.toLowerCase() !== 'delete') {
                        fspiopBody = (await TransformFacades.FSPIOPISO20022[resourceType][ctx.method.toLowerCase() + (isError ? 'Error' : '')](transformOpts)).body;
                    }
                    const fspiopHeaders = transformHeadersIsoToFspiop(ctx.request.headers);
                    ctx.state.transformedFspiopPayload = {
                        headers: fspiopHeaders,
                        body: fspiopBody
                    };
                } catch {
                    // silently fail if the transform fails
                    ctx.state.logger.isWarnEnabled && ctx.state.logger.push({ resource: ctx.state.path.pattern }).warn('Transform failed');
                }
            }
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
        let req;
        if (Config.apiType === API_TYPES.iso20022 && ctx.state.transformedFspiopPayload){
            req = {
                headers: ctx.state.transformedFspiopPayload.headers || ctx.request.headers,
                data: ctx.state.transformedFspiopPayload.body || ctx.request.body,
            };
        } else {
            req = {
                headers: ctx.request.headers,
                data: ctx.request.body,
            };
        }

        const prefix = ctx.method.toLowerCase() === 'put' ? cache.CALLBACK_PREFIX : cache.REQUEST_PREFIX;
        const res = await cache.set(`${prefix}${ctx.state.fspiopId}`, req);
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ res }).debug('Caching request');
    }
    await next();
};


/**
 * tag each incoming request with a unique identifier
 * @return {Function}
 */
const createRequestIdGenerator = (logger) => async (ctx, next) => {
    ctx.request.id = generateSlug(4);
    ctx.state.receivedAt = Date.now();

    if (shouldLog(ctx.path, logger)) {
        const { method, path, id, headers } = ctx.request;
        logger
            .push({ method, path, id, headers })
            .info(`[==> req] ${method?.toUpperCase()} ${path} - requestId: ${id}`);
    }

    await next();
};


/**
 * Deal with mojaloop API content type headers, treat as JSON
 * This is based on the Hapi header validation plugin found in `central-services-shared`
 * Since `sdk-scheme-adapter` uses Koa instead of Hapi we convert the plugin
 * into middleware
 * @param logger
 * @return {Function}
 */
//
const createHeaderValidator = (conf) => async (
    ctx,
    next,
    resources = defaultProtocolResources,
    supportedProtocolVersions = defaultProtocolVersions
) => {
    const { logger } = ctx.state;
    const request = ctx.request;

    // First, extract the resource type from the path
    const resource = request.path.replace(/^\//, '').split('/')[conf.multiDfsp ? 1 : 0];

    // Only validate requests for the requested resources
    if (!resources.includes(resource)) {
        logger.info(`skipping header validation for ${resource}`);
        return await next();
    }

    const apiType = common.defineApiType(resource, conf.apiType);

    // Always validate the accept header for a get request, or optionally if it has been
    // supplied
    if (request.method.toLowerCase() === 'get' || request.headers.accept) {
        if (request.headers.accept === undefined) {
            ctx.response.status = Errors.MojaloopApiErrorCodes.MISSING_ELEMENT.httpStatusCode;
            ctx.response.body = new Errors.MojaloopFSPIOPError(
                Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.MISSING_ELEMENT.httpStatusCode),
                errorMessages.REQUIRE_ACCEPT_HEADER,
                null,
                Errors.MojaloopApiErrorCodes.MISSING_ELEMENT
            ).toApiErrorObject();
            logger.error('accept header is missing');
            return;
        }
        const accept = parseAcceptHeader(resource, request.headers.accept, apiType);
        if (!accept.valid) {
            ctx.response.status = Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode;
            ctx.response.body = new Errors.MojaloopFSPIOPError(
                Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode),
                errorMessages.INVALID_ACCEPT_HEADER,
                null,
                Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX
            ).toApiErrorObject();
            logger.error('accept header is invalid');
            return;
        }
        if (!supportedProtocolVersions.some(supportedVer => accept.versions.has(supportedVer))) {
            ctx.response.status = Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION.httpStatusCode;
            ctx.response.body = new Errors.MojaloopFSPIOPError(
                Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION.httpStatusCode),
                errorMessages.REQUESTED_VERSION_NOT_SUPPORTED,
                null,
                Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION,
                protocolVersionsMap
            ).toApiErrorObject();
            logger.error('accept header has unacceptable version');
            return;
        }
    }

    // Always validate the content-type header
    if (request.headers['content-type'] === undefined) {
        ctx.response.status = Errors.MojaloopApiErrorCodes.MISSING_ELEMENT.httpStatusCode;
        ctx.response.body = new Errors.MojaloopFSPIOPError(
            Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.MISSING_ELEMENT.httpStatusCode),
            errorMessages.REQUIRE_CONTENT_TYPE_HEADER,
            null,
            Errors.MojaloopApiErrorCodes.MISSING_ELEMENT,
            protocolVersionsMap
        ).toApiErrorObject();
        logger.error('contentType header is undefined');
        return;
    }

    const contentType = parseContentTypeHeader(resource, request.headers['content-type'], apiType);
    if (!contentType.valid) {
        ctx.response.status = Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode;
        ctx.response.body = new Errors.MojaloopFSPIOPError(
            Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode),
            errorMessages.INVALID_CONTENT_TYPE_HEADER,
            null,
            Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX
        ).toApiErrorObject();
        logger.error('contentType header is invalid');
        return;
    }

    if (!supportedProtocolVersions.includes(contentType.version)) {
        ctx.response.status = Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION.httpStatusCode;
        ctx.response.body = new Errors.MojaloopFSPIOPError(
            Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION.httpStatusCode),
            errorMessages.SUPPLIED_VERSION_NOT_SUPPORTED,
            null,
            Errors.MojaloopApiErrorCodes.UNACCEPTABLE_VERSION,
            protocolVersionsMap
        ).toApiErrorObject();
        logger.error('contentType header has unacceptable version');
        return;
    }

    const isOk = await extractRequestBody(conf, ctx);
    if (!isOk) return;

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
    // todo: take logger from ctx
    const jwsValidator = new Jws.validator({
        logger,
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
                logger.info('skipping jws validation on put parties. config flag is set');
                return await next();
            }

            if (isPingRoute(ctx)) return await next();

            // we dont check signatures on GET requests
            // todo: validate this requirement. No state is mutated by GETs but
            // there are potential security issues if message origin is used to
            // determine permission sets i.e. what is "readable"
            if (ctx.request.method !== 'GET') {
                logger.isDebugEnabled && logger.push({ request: ctx.request, body: ctx.request.body }).debug('Validating JWS');
                jwsValidator.validate(ctx.request);
            }

        } catch (err) {
            logger.error('Inbound request failed JWS validation', err);

            ctx.response.status = ReturnCodes.BADREQUEST.CODE;
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

    await next();
};

/**
 * Add validation for each inbound request
 * @param validator
 * @return {Function}
 */
const createRequestValidator = (validator) => async (ctx, next) => {
    if (!ctx.state.logExcludePaths.includes(ctx.path)) {
        ctx.state.logger.isDebugEnabled && ctx.state.logger.debug('Validating request');
    }
    try {
        const matchedPathObject = validator.validateRequest(ctx, ctx.state.logger);
        ctx.state.path = {
            ...matchedPathObject
        };
        if (!ctx.state.logExcludePaths.includes(ctx.path)) {
            ctx.state.logger.isDebugEnabled && ctx.state.logger.debug('Request passed validation');
        }
        await next();
    } catch (err) {
        ctx.state.logger.push({ err }).error('Request failed validation.');
        // send a mojaloop spec error response
        ctx.response.status = err.httpStatusCode || ReturnCodes.BADREQUEST.CODE;

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


const logResponse = (ctx) => {
    if (shouldLog(ctx.path, ctx.state.logger)) {
        const { method, path, id } = ctx.request;
        const { status = 'n/a' } = ctx.response;
        const processTime = ((Date.now() - ctx.state.receivedAt) / 1000).toFixed(1);
        ctx.state.logger.info(`[<== ${status}] ${method?.toUpperCase()} ${path} [${processTime}sec] - requestId: ${id}`);
    }
};

const createResponseLogging = () => async (ctx, next) => {
    logResponse(ctx);
    return await next();
};

const createPingMiddleware = (config, validationKeys) => async (ctx, next) => {
    if (!isPingRoute(ctx)) return await next();

    const { logger } = ctx.state;
    const isOk = await extractRequestBody(config, ctx);
    if (!isOk) {
        logger.warn('failed to extract request body');
        return;
    }

    let result;

    if (validationKeys) {
        const jwsValidator = new Jws.validator({
            logger,
            validationKeys,
        });

        try {
            result = jwsValidator.validate(ctx.request);
        } catch (err) {
            result = err;
        }
    }

    ctx.state.jwsPingValidationResult = result;
    logger.verbose(`is jwsPingValidation passed: ${result === true}`);

    await next();
};

const extractRequestBody = async (conf, ctx) => {
    try {
        const body =  await coBody.json(ctx.req, { limit: conf.fspiopApiServerMaxRequestBytes });
        ctx.request.body = body;
        ctx.state.logger.debug('incoming request body: ', { body });
        return true;
    } catch (err) {
        // error parsing body
        ctx.state.logger.error('Error parsing body: ', err);
        ctx.response.status = Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX.httpStatusCode;
        ctx.response.body = new Errors.MojaloopFSPIOPError(err, err.message, null,
            Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX).toApiErrorObject();

    }
};

const isPingRoute = (ctx) => ctx.request?.path?.startsWith('/ping');

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
    createResponseLogging,
    createPingMiddleware,
    logResponse,
};
