/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

const Koa = require('koa');

const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const Metrics = require('@mojaloop/central-services-metrics');

const { Logger, Transports } = require('@internal/log');
const globalMiddleWare = require('@internal/middleware');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

class InboundServer {
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._server = null;
        this._logger = null;
    }

    async setupApi() {
        this._api = new Koa();
        this._logger = await this._createLogger();

        const cache = await this._createCache();
        await cache.connect();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        const validator = new Validate();
        await validator.initialise(apiSpecs);
        this._api.use(globalMiddleWare.createSpan());
        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        this._api.use(middlewares.createHeaderValidator(this._logger));

        if(this._conf.validateInboundJws) {
            const jwsExclusions = [];
            if (!this._conf.validateInboundPutPartiesJws) {
                jwsExclusions.push('putParties');
            }
            this._api.use(middlewares.createJwsValidator(this._logger, this._conf.jwsVerificationKeys, jwsExclusions));
        }

        const sharedState = { cache, conf: this._conf };
        this._api.use(middlewares.createLogger(this._logger, sharedState));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers.map));
        this._api.use(middlewares.createResponseBodyHandler());
        this._api.use(globalMiddleWare.finishSpan());

        this._server = this._createServer();
    }

    async start() {
        await new Promise((resolve) => {
            this._server.listen(this._conf.inboundPort, () => {
                this._logger.log(`Serving inbound API on port ${this._conf.inboundPort}`);
                return resolve();
            });
        });
    }

    async stop() {
        if (this._server) {
            await new Promise(resolve => {
                this._server.close(() => {
                    console.log('inbound shut down complete');
                    return resolve();
                });
            });
        }
    }

    async _createLogger() {
        const transports = await Promise.all([Transports.consoleDir()]);
        // Set up a logger for each running server
        return new Logger({
            context: {
                app: 'mojaloop-sdk-inbound-api'
            },
            space: this._conf.logIndent,
            transports,
        });
    }

    async _createCache() {
        const transports = await Promise.all([Transports.consoleDir()]);
        const logger = new Logger({
            context: {
                app: 'mojaloop-sdk-inboundCache'
            },
            space: this._conf.logIndent,
            transports,
        });

        const cacheConfig = {
            ...this._conf.cacheConfig,
            logger
        };

        return new Cache(cacheConfig);
    }

    _createServer() {
        let server;
        // If config specifies TLS, start an HTTPS server; otherwise HTTP
        if (this._conf.tls.inbound.mutualTLS.enabled) {
            const inboundHttpsOpts = {
                ...this._conf.tls.inbound.creds,
                requestCert: true,
                rejectUnauthorized: true // no effect if requestCert is not true
            };
            server = https.createServer(inboundHttpsOpts, this._api.callback());
        } else {
            server = http.createServer(this._api.callback());
        }
        return server;
    }

    initializeInstrumentation() {
        if (!this._conf.metrics.disabled) {
            Metrics.setup(this._conf.metrics.config);
        }
    }
}

module.exports = InboundServer;
