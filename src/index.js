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


const Koa = require('koa');
const koaBody = require('koa-body');
const util = require('util');
const coBody = require('co-body');
const https = require('https');
const http = require('http');
const yaml = require('yamljs');

const randomPhrase = require('@internal/randomphrase');
const Validate = require('@internal/validate');

const inboundHandlers = require('./inboundApi/handlers.js');
const outboundHandlers = require('./outboundApi/handlers.js');

const router = require('@internal/router');
const { setConfig, getConfig } = require('./config.js');
const { Logger, Transports } = require('@internal/log');

const Cache = require('@internal/cache');

const inboundApi = new Koa();
const outboundApi = new Koa();

const inboundApiSpec = yaml.load('./inboundApi/api.yaml');
const outboundApiSpec = yaml.load('./outboundApi/api.yaml');

const Jws = require('@modusbox/mojaloop-sdk-standard-components').Jws;
const Errors = require('@modusbox/mojaloop-sdk-standard-components').Errors;


(async function() {
    // Set up the config from the environment
    await setConfig(process.env);
    const conf = getConfig();

    console.log(`Config loaded: ${util.inspect(conf, { depth: 10 })}`);

    // Set up a logger for each running server
    const space = Number(process.env.LOG_INDENT);

    // set up connection to cachc
    const inboundCacheTransports = await Promise.all([Transports.consoleDir()]);
    const inboundCacheLogger = new Logger({ context: { app: 'mojaloop-sdk-inboundCache' }, space, transports:inboundCacheTransports });

    const inboundCacheConfig = {
        ...conf.cacheConfig,
        logger: inboundCacheLogger
    };

    const inboundCache = new Cache(inboundCacheConfig);
    await inboundCache.connect();

    const outboundCacheTransports = await Promise.all([Transports.consoleDir()]);
    const outboundCacheLogger = new Logger({ context: { app: 'mojaloop-sdk-outboundCache' }, space, transports:outboundCacheTransports });

    const outboundCacheConfig = {
        ...conf.cacheConfig,
        logger: outboundCacheLogger
    };

    const outboundCache = new Cache(outboundCacheConfig);
    await outboundCache.connect();

    const inboundTransports = await Promise.all([Transports.consoleDir()]);
    const inboundLogger = new Logger({ context: { app: 'mojaloop-sdk-inbound-api' }, space, transports:inboundTransports });

    const outboundTransports = await Promise.all([Transports.consoleDir()]);
    const outboundLogger = new Logger({ context: { app: 'mojaloop-sdk-outbound-api' }, space, transports:outboundTransports });

    const jwsValidator = new Jws.validator({
        logger: inboundLogger,
        validationKeys: conf.jwsVerificationKeys
    });


    // Log raw to console as a last resort
    const failSafe = async (ctx, next) => {
        try {
            await next();
        } catch (err) {
            // TODO: return a 500 here if the response has not already been sent?
            console.log(`Error caught in catchall: ${err.stack || util.inspect(err, { depth: 10 })}`);
        }
    };

    inboundApi.use(failSafe);
    outboundApi.use(failSafe);

    // tag each incoming request with a unique identifier
    inboundApi.use(async (ctx, next) => {
        ctx.request.id = randomPhrase();
        await next();
    });

    // Deal with mojaloop API content type headers...
    // treat as JSON
    inboundApi.use(async (ctx, next) => {
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
                inboundLogger.push({ err }).log('Error parsing body');
                ctx.response.status = 400;
                ctx.response.body = new Errors.MojaloopFSPIOPError(err, err.message, null,
                    Errors.MojaloopApiErrorCodes.MALFORMED_SYNTAX).toApiErrorObject();
                return;
            }
        }
        await next();
    });


    // JWS validation for incoming requests
    inboundApi.use(async (ctx, next) => {
        if(conf.validateInboundJws) {
            try {
                if(ctx.request.method !== 'GET') {
                    jwsValidator.validate(ctx.request, inboundLogger);
                }
            }
            catch(err) {
                inboundLogger.push({ err }).log('Inbound request failed JWS validation');

                ctx.response.status = 400;
                ctx.response.body = new Errors.MojaloopFSPIOPError(err, err.message, null,
                    Errors.MojaloopApiErrorCodes.INVALID_SIGNATURE).toApiErrorObject();
                return;
            }
        }
        await next();
    });


    // outbound always expects application/json
    outboundApi.use(koaBody());

    // Add a log context for each request, log the receipt and handling thereof
    inboundApi.use(async (ctx, next) => {
        ctx.state.cache = inboundCache;
        ctx.state.conf = conf;
        ctx.state.logger = inboundLogger.push({ request: {
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
        ctx.state.logger.log('Request processed');
    });

    outboundApi.use(async (ctx, next) => {
        ctx.state.cache = outboundCache;
        ctx.state.conf = conf;
        ctx.state.logger = outboundLogger.push({ request: {
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
        ctx.state.logger.log('Request processed');
    });

    // Add validation for each inbound request
    const inboundValidator = new Validate();

    inboundApi.use(async (ctx, next) => {
        ctx.state.logger.log('Validating request');
        try {
            ctx.state.path = inboundValidator.validateRequest(ctx, ctx.state.logger);
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
    });


    // Add validation for each outbound request
    const outboundValidator = new Validate();

    outboundApi.use(async (ctx, next) => {
        ctx.state.logger.log('Validating request');
        try {
            ctx.state.path = outboundValidator.validateRequest(ctx, ctx.state.logger);
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
    });


    // Handle requests
    inboundApi.use(router(inboundHandlers.map));
    inboundApi.use(async (ctx, next) => {
        // Override Koa's default behaviour of returning the status code as text in the body. If we
        // haven't defined the body, we want it empty. Note that if setting this to null, Koa appears
        // to override the status code with a 204. This is correct behaviour in the sense that the
        // status code correctly corresponds to the content (none) but unfortunately the Mojaloop API
        // does not respect this convention and requires a 200.
        if (ctx.response.body === undefined) {
            ctx.response.body = '';
        }
        return await next();
    });
    outboundApi.use(router(outboundHandlers.map));

    await Promise.all([
        inboundValidator.initialise(inboundApiSpec),
        outboundValidator.initialise(outboundApiSpec)
    ]);

    // If config specifies TLS, start an HTTPS server; otherwise HTTP
    const inboundPort = conf.inboundPort;
    const outboundPort = conf.outboundPort;

    let inboundServer;
    let outboundServer;

    if (conf.tls.mutualTLS.enabled) {
        const inboundHttpsOpts = {
            ...conf.tls.inboundCreds,
            requestCert: true,
            rejectUnauthorized: true // no effect if requestCert is not true
        };
        inboundServer = https.createServer(inboundHttpsOpts, inboundApi.callback()).listen(inboundPort);
    } else {
        inboundServer = http.createServer(inboundApi.callback()).listen(inboundPort);
    }

    inboundLogger.log(`Serving inbound API on port ${inboundPort}`);

    outboundServer = http.createServer(outboundApi.callback()).listen(outboundPort);
    outboundLogger.log(`Serving outbound API on port ${outboundPort}`);

    // handle SIGTERM to exit gracefully
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received. Shutting down APIs...');

        await Promise.all([(() => {
            return new Promise(resolve => {
                inboundServer.close(() => {
                    console.log('inbound SIGTERM shut down complete');
                    return resolve();
                });
            });
        })(), (() => {
            return new Promise(resolve => {
                outboundServer.close(() => {
                    console.log('outbound SIGTERM shut down compete');
                    return resolve();
                });
            });
        })()]);

        process.exit(0);
    });
})().catch(err => {
    console.error(err);
    process.exit(1);
});
