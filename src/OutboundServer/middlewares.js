const randomPhrase = require('@internal/randomphrase');

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
            message: err.message,
            statusCode: 400
        };
    }
};

module.exports = {
    createErrorHandler,
    createLogger,
    createRequestValidator,
};
