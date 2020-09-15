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
const { addCustomKeys } = require('@internal/openapi');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

class InboundServer {
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._server = null;
        this._logger = null;
        this._jwsVerificationKeys = {};
    }

    async setupApi() {
        this._api = new Koa();
        this._logger = await this._createLogger();

        this._cache = await this._createCache();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        const validator = new Validate();
        await validator.initialise(addCustomKeys(apiSpecs));

        this._wso2Auth = new WSO2Auth({
            ...this._conf.wso2Auth,
            logger: this._logger,
            tlsCreds: this._conf.tls.outbound.mutualTLS.enabled && this._conf.tls.outbound.creds,
        });

        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        this._api.use(middlewares.createHeaderValidator(this._logger));
        if (this._conf.validateInboundJws) {
            const jwsExclusions = [];
            if (!this._conf.validateInboundPutPartiesJws) {
                jwsExclusions.push('putParties');
            }
            this._jwsVerificationKeys = this._getJwsKeys();
            this._api.use(middlewares.createJwsValidator(this._logger, this._jwsVerificationKeys, jwsExclusions));
        }

        const sharedState = { cache: this._cache, wso2Auth: this._wso2Auth, conf: this._conf };
        this._api.use(middlewares.createLogger(this._logger, sharedState));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
        this._api.use(middlewares.createResponseBodyHandler());

        this._server = this._createServer();
        this._api.context.resourceVersions = this._conf.resourceVersions;
        return this._server;
    }

    async start() {
        this._startJwsWatcher();
        await this._cache.connect();
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2Auth.start();
        }
        if (!this._conf.testingDisableServerStart) {
            await new Promise((resolve) => this._server.listen(this._conf.inboundPort, resolve));
            this._logger.log(`Serving inbound API on port ${this._conf.inboundPort}`);
        }
    }

    async stop() {
        if (!this._server) {
            return;
        }
        await new Promise(resolve => this._server.close(resolve));
        this._wso2Auth.stop();
        await this._cache.disconnect();
        this._stopJwsWatcher();
        console.log('inbound shut down complete');
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

    _getJwsKeys() {
        const keys = {};
        if (this._conf.jwsVerificationKeysDirectory) {
            fs.readdirSync(this._conf.jwsVerificationKeysDirectory)
                .filter(f => f.endsWith('.pem'))
                .forEach(f => {
                    const keyName = path.basename(f, '.pem');
                    const keyPath = path.join(this._conf.jwsVerificationKeysDirectory, f);
                    keys[keyName] = fs.readFileSync(keyPath);
                });
        }
        return keys;
    }

    _startJwsWatcher() {
        const FS_EVENT_TYPES = {
            CHANGE: 'change',
            RENAME: 'rename'
        };
        const watchHandler = async (eventType, filename) => {
            // On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory.
            // From: https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener
            if (path.extname(filename) !== '.pem') {
                return;
            }
            const keyName = path.basename(filename, '.pem');
            const keyPath = path.join(this._conf.jwsVerificationKeysDirectory, filename);
            if (eventType === FS_EVENT_TYPES.RENAME) {
                if (fs.existsSync(keyPath)) {
                    this._jwsVerificationKeys[keyName] = await fs.promises.readFile(keyPath);
                } else {
                    delete this._jwsVerificationKeys[keyName];
                }
            } else if (eventType === FS_EVENT_TYPES.CHANGE) {
                this._jwsVerificationKeys[keyName] = await fs.promises.readFile(keyPath);
            }
        };
        if (this._conf.jwsVerificationKeysDirectory) {
            this.keyWatcher = fs.watch(this._conf.jwsVerificationKeysDirectory, watchHandler);
        }
    }

    _stopJwsWatcher() {
        if (this.keyWatcher) {
            this.keyWatcher.close();
        }
    }
}

module.exports = InboundServer;
