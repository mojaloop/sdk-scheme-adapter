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

const assert = require('assert').strict;
const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

class InboundApi extends EventEmitter {
    constructor(conf, logger, cache, validator) {
        super({ captureExceptions: true });
        this._conf = conf;
        this._cache = cache;
        this._wso2 = {
            auth: new WSO2Auth({
                ...conf.wso2.auth,
                logger,
                tlsCreds: conf.mutualTLS.outboundRequests.enabled && conf.mutualTLS.outboundRequests.creds,
            }),
            retryWso2AuthFailureTimes: conf.wso2.requestAuthFailureRetryTimes,
        };
        this._wso2.auth.on('error', (msg) => {
            this.emit('error', 'WSO2 auth error in InboundApi', msg);
        });

        if (conf.validateInboundJws) {
            this._jwsVerificationKeys = InboundApi._GetJwsKeys(conf.jwsVerificationKeysDirectory);
        }
        this._api = InboundApi._SetupApi({
            conf,
            logger,
            validator,
            cache,
            jwsVerificationKeys: this._jwsVerificationKeys,
            wso2: this._wso2,
        });
    }

    async start() {
        this._startJwsWatcher();
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2.auth.start();
        }
    }

    stop() {
        this._wso2.auth.stop();
        if (this._keyWatcher) {
            this._keyWatcher.close();
            this._keyWatcher = null;
        }
    }

    callback() {
        return this._api.callback();
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
            this._keyWatcher = fs.watch(this._conf.jwsVerificationKeysDirectory, watchHandler);
        }
    }

    static _SetupApi({ conf, logger, validator, cache, jwsVerificationKeys, wso2 }) {
        const api = new Koa();

        api.use(middlewares.createErrorHandler(logger));
        api.use(middlewares.createRequestIdGenerator());
        api.use(middlewares.createHeaderValidator(logger));
        if (conf.validateInboundJws) {
            const jwsExclusions = conf.validateInboundPutPartiesJws ? [] : ['putParties'];
            api.use(middlewares.createJwsValidator(logger, jwsVerificationKeys, jwsExclusions));
        }

        api.use(middlewares.applyState({ cache, wso2, conf }));
        api.use(middlewares.createLogger(logger));
        api.use(middlewares.createRequestValidator(validator));
        api.use(middlewares.assignFspiopIdentifier());
        if (conf.enableTestFeatures) {
            api.use(middlewares.cacheRequest(cache));
        }
        api.use(router(handlers));
        api.use(middlewares.createResponseBodyHandler());

        api.context.resourceVersions = conf.resourceVersions;

        return api;
    }

    static _GetJwsKeys(fromDir) {
        const keys = {};
        if (fromDir) {
            fs.readdirSync(fromDir)
                .filter(f => f.endsWith('.pem'))
                .forEach(f => {
                    const keyName = path.basename(f, '.pem');
                    const keyPath = path.join(fromDir, f);
                    keys[keyName] = fs.readFileSync(keyPath);
                });
        }
        return keys;
    }
}

class InboundServer extends EventEmitter {
    constructor(conf, logger, cache) {
        super({ captureExceptions: true });
        this._conf = conf;
        this._validator = new Validate();
        this._logger = logger;
        this._api = new InboundApi(
            conf,
            this._logger.push({ component: 'api' }),
            cache,
            this._validator
        );
        this._api.on('error', (...args) => {
            this.emit('error', ...args);
        });
        this._server = this._createServer(
            conf.mutualTLS.inboundRequests.enabled,
            conf.mutualTLS.inboundRequests.creds,
            this._api.callback()
        );
    }

    async start() {
        assert(!this._server.listening, 'Server already listening');
        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);
        await this._api.start();
        await new Promise((resolve) => this._server.listen(this._conf.inboundServerPort, resolve));
        this._logger.log(`Serving inbound API on port ${this._conf.inboundServerPort}`);
    }

    async stop() {
        if (this._server) {
            await new Promise(resolve => this._server.close(resolve));
            this._server = null;
        }
        if (this._api) {
            await this._api.stop();
            this._api = null;
        }
        this._logger.log('inbound shut down complete');
    }

    _createServer(tlsEnabled, tlsCreds, handler) {
        if (!tlsEnabled) {
            return http.createServer(handler);
        }

        const inboundHttpsOpts = {
            ...tlsCreds,
            requestCert: true,
            rejectUnauthorized: true // no effect if requestCert is not true
        };
        return https.createServer(inboundHttpsOpts, handler);
    }

}

module.exports = InboundServer;
