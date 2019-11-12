const util = require('util');
const coBody = require('co-body');

const randomPhrase = require('@internal/randomphrase');
const { Jws, Errors } = require('@mojaloop/sdk-standard-components');

// Log raw to console as a last resort
const createErrorHandler = () => async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        // TODO: return a 500 here if the response has not already been sent?
        console.log(`Error caught in catchall: ${err.stack || util.inspect(err, { depth: 10 })}`);
    }
};

// tag each incoming request with a unique identifier
const createRequestIdGenerator = () => async (ctx, next) => {
    ctx.request.id = randomPhrase();
    await next();
};


// Deal with mojaloop API content type headers...
// treat as JSON
const createHeaderValidator = (logger) => async (ctx, next) => {
    const validHeaders = new Set([
        'application/vnd.interoperability.parties+json;version=1.0',
        'application/vnd.interoperability.participants+json;version=1.0',
        'application/vnd.interoperability.quotes+json;version=1.0',
        'application/vnd.interoperability.transfers+json;version=1.0',
        'application/json'
    ]);
    if (validHeaders.has(ctx.request.headers['content-type'])) {
        try {
            ctx.request.body = await coBody.json(ctx.req);
        }
        catch(err) {
            // error parsing body
            logger.push({ err }).log('Error parsing body');
            ctx.response.status = 400;
            ctx.response.body = new Errors.MojaloopFSPIOPError(err, err.message, null,
                Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX).toApiErrorObject();
            return;
        }
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


// Add a log context for each request, log the receipt and handling thereof
const createLogger = (logger, sharedState) => async (ctx, next) => {
    ctx.state = {
        ...ctx.state,
        ...sharedState,
    };
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

// Add validation for each inbound request
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

        //generic mojaloop spec validation error
        ctx.response.body = {
            errorInformation: {
                errorCode: '3100',
                errorDescription: `${err.dataPath ? err.dataPath + ' ' : ''}${err.message}`
            }
        };
    }
};

// this.api.use(router(handlers.map));
const createResponseBodyHandler = () => async (ctx, next) => {
    // Override Koa's default behaviour of returning the status code as text in the body. If we
    // haven't defined the body, we want it empty. Note that if setting this to null, Koa appears
    // to override the status code with a 204. This is correct behaviour in the sense that the
    // status code correctly corresponds to the content (none) but unfortunately the Mojaloop API
    // does not respect this convention and requires a 200.
    if (ctx.response.body === undefined) {
        ctx.response.body = '';
    }
    return await next();
};

module.exports = {
    createErrorHandler,
    createRequestIdGenerator,
    createHeaderValidator,
    createJwsValidator,
    createLogger,
    createRequestValidator,
    createResponseBodyHandler,
};
