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
const fs = require('fs');
const yaml = require('js-yaml');

const randomPhrase = require('@internal/randomphrase');
const Validate = require('@internal/validate');

const inboundHandlers = require('./inboundApi/handlers.js');
const outboundHandlers = require('./outboundApi/handlers.js');
const OAuthTestServer = require('./OAuthTestServer');

const router = require('@internal/router');
const { setConfig, getConfig } = require('./config.js');
const { Logger, Transports } = require('@internal/log');

const Cache = require('@internal/cache');

const inboundApiSpec = yaml.load(fs.readFileSync('./inboundApi/api.yaml'));
const outboundApiSpec = yaml.load(fs.readFileSync('./outboundApi/api.yaml'));

const Jws = require('@mojaloop/sdk-standard-components').Jws;
const Errors = require('@mojaloop/sdk-standard-components').Errors;


class Server {
    constructor(conf) {
        this.conf = conf;
        this.inboundApi = new Koa();
        this.outboundApi = new Koa();

        this.inboundServer = {};
        this.outboundServer = {};
        this.oauthTestServer = {};
        this.jwsValidator = {};
    }


    async start() {
        // Set up the config from the environment
        const conf = this.conf;

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

        this.jwsValidator = new Jws.validator({
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

        this.inboundApi.use(failSafe);
        this.outboundApi.use(failSafe);

        // tag each incoming request with a unique identifier
        this.inboundApi.use(async (ctx, next) => {
            ctx.request.id = randomPhrase();
            await next();
        });

        // Deal with mojaloop API content type headers...
        // treat as JSON
        this.inboundApi.use(async (ctx, next) => {
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
        this.inboundApi.use(async (ctx, next) => {
            if(conf.validateInboundJws) {
                try {
                    // we skip inbound JWS validation on PUT /parties requests if our config flag
                    // is set to do so.
                    if(!conf.validateInboundPutPartiesJws
                        && ctx.request.method === 'PUT'
                        && ctx.request.path.startsWith('/parties/')) {
                        inboundLogger.log('Skipping jws validation on put parties. config flag is set');
                        return await next();
                    }

                    // we dont check signatures on GET requests
                    // todo: validate this requirement. No state is mutated by GETs but
                    // there are potential security issues if message origin is used to
                    // determine permission sets i.e. what is "readable"
                    if(ctx.request.method !== 'GET') {
                        this.jwsValidator.validate(ctx.request, inboundLogger);
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
        this.outboundApi.use(koaBody());

        // Add a log context for each request, log the receipt and handling thereof
        this.inboundApi.use(async (ctx, next) => {
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

        this.outboundApi.use(async (ctx, next) => {
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

        this.inboundApi.use(async (ctx, next) => {
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

        this.outboundApi.use(async (ctx, next) => {
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
        this.inboundApi.use(router(inboundHandlers.map));
        this.inboundApi.use(async (ctx, next) => {
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
        this.outboundApi.use(router(outboundHandlers.map));

        await Promise.all([
            inboundValidator.initialise(inboundApiSpec),
            outboundValidator.initialise(outboundApiSpec)
        ]);

        // If config specifies TLS, start an HTTPS server; otherwise HTTP
        const inboundPort = conf.inboundPort;
        const outboundPort = conf.outboundPort;

        if (conf.tls.mutualTLS.enabled) {
            const inboundHttpsOpts = {
                ...conf.tls.inboundCreds,
                requestCert: true,
                rejectUnauthorized: true // no effect if requestCert is not true
            };
            this.inboundServer = https.createServer(inboundHttpsOpts, this.inboundApi.callback());
        } else {
            this.inboundServer = http.createServer(this.inboundApi.callback());
        }

        this.outboundServer = http.createServer(this.outboundApi.callback());

        if (conf.oauthTestServer.enabled) {
            this.oauthTestServer = OAuthTestServer({
                clientKey: conf.oauthTestServer.clientKey,
                clientSecret: conf.oauthTestServer.clientSecret,
                port: conf.oauthTestServer.listenPort
            });
        } else {
            this.oauthTestServer = Promise.resolve();
        }

        await new Promise((resolve) => {
            this.inboundServer.listen(inboundPort, () => {
                inboundLogger.log(`Serving inbound API on port ${inboundPort}`);
                return resolve();
            });
        });

        await new Promise((resolve) => {
            this.outboundServer.listen(outboundPort, () => {
                outboundLogger.log(`Serving outbound API on port ${outboundPort}`);
                return resolve();
            });
        });
    }


    async stop() {
        await Promise.all([
            new Promise(resolve => {
                this.inboundServer.close(() => {
                    console.log('inbound shut down complete');
                    return resolve();
                });
            }),
            new Promise(resolve => {
                this.outboundServer.close(() => {
                    console.log('outbound shut down compete');
                    return resolve();
                });
            }),
            this.oauthTestServer,
        ]);
    }
}


if(require.main === module) {
    (async () => {
        // we were started direct, not required as in unit test scenario
        await setConfig(process.env);
        const conf = getConfig();

        const svr = new Server(conf);

        // handle SIGTERM to exit gracefully
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received. Shutting down APIs...');

            await svr.stop();
            process.exit(0);
        });

        svr.start().catch(err => {
            console.log(err);
            process.exit(1);
        });
    })();
}


// export things we want to unit test
module.exports = {
    Server: Server
};
