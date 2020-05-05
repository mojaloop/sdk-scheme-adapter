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

const { WSO2Auth } = require('@mojaloop/sdk-standard-components');
const { Logger, Transports } = require('@internal/log');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('../InboundServer/middlewares');

class TestServer {
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._server = null;
        this._logger = null;
    }

    async setupApi() {
        this._api = new Koa();
        this._logger = await this._createLogger();

        this._cache = await this._createCache();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        const validator = new Validate();
        await validator.initialise(apiSpecs);

        this._wso2Auth = new WSO2Auth({
            ...this._conf.wso2Auth,
            logger: this._logger,
            tlsCreds: this._conf.tls.test.mutualTLS.enabled && this._conf.tls.test.creds,
        });

        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        const sharedState = { cache: this._cache, wso2Auth: this._wso2Auth, conf: this._conf };
        this._api.use(middlewares.createLogger(this._logger, sharedState));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
        this._api.use(middlewares.createResponseBodyHandler());

        this._server = this._createServer();
        return this._server;
    }

    async start() {
        await this._cache.connect();
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2Auth.start();
        }
        if (!this._conf.testingDisableServerStart) {
            await new Promise((resolve) => this._server.listen(this._conf.testPort, resolve));
            this._logger.log(`Serving test API on port ${this._conf.testPort}`);
        }
    }

    async stop() {
        if (!this._server) {
            return;
        }
        await new Promise(resolve => this._server.close(resolve));
        this._wso2Auth.stop();
        await this._cache.disconnect();
        console.log('api shut down complete');
    }

    async _createLogger() {
        const transports = await Promise.all([Transports.consoleDir()]);
        // Set up a logger for each running server
        return new Logger({
            context: {
                app: 'mojaloop-sdk-test-api'
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
        if (this._conf.tls.test.mutualTLS.enabled) {
            const testHttpsOpts = {
                ...this._conf.tls.test.creds,
                requestCert: true,
                rejectUnauthorized: true // no effect if requestCert is not true
            };
            server = https.createServer(testHttpsOpts, this._api.callback());
        } else {
            server = http.createServer(this._api.callback());
        }
        return server;
    }
}

module.exports = TestServer;
