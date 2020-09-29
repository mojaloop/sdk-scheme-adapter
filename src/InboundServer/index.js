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

const { WSO2Auth, Logger } = require('@mojaloop/sdk-standard-components');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

// TODO: consider splitting much of InboundServer out into a separate InboundAPI class. Then, when
// reconfiguring InboundServer, destroy the instance of InboundAPI and create a new one.

class InboundApi {
    constructor(conf, logger, validator) {
        this._conf = conf;
        this._cache = new Cache({
            ...conf.cacheConfig,
            logger: logger.push({ component: 'cache' })
        });
        this._wso2Auth = new WSO2Auth({
            ...conf.wso2Auth,
            logger,
            tlsCreds: conf.tls.outbound.mutualTLS.enabled && conf.tls.outbound.creds,
        });
        if (conf.validateInboundJws) {
            this._jwsVerificationKeys = InboundApi._GetJwsKeys(conf.jwsVerificationKeysDirectory);
        }
        this._api = InboundApi._SetupApi({
            conf,
            logger,
            validator,
            cache: this._cache,
            jwsVerificationKeys: this._jwsVerificationKeys,
            wso2Auth: this._wso2Auth,
        });
    }

    async start() {
        this._startJwsWatcher();
        await this._cache.connect();

        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2Auth.start();
        }
    }

    async stop() {
        this._wso2Auth.stop();
        await this._cache.disconnect();
        if (this._keyWatcher) {
            this._keyWatcher.close();
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

    static _SetupApi({ conf, logger, validator, cache, jwsVerificationKeys, wso2Auth }) {
        const api = new Koa();

        api.use(middlewares.createErrorHandler());
        api.use(middlewares.createRequestIdGenerator());
        api.use(middlewares.createHeaderValidator(logger));
        if (conf.validateInboundJws) {
            const jwsExclusions = conf.validateInboundPutPartiesJws ? [] : ['putParties'];
            api.use(middlewares.createJwsValidator(logger, jwsVerificationKeys, jwsExclusions));
        }

        const sharedState = { cache, wso2Auth, conf };
        api.use(middlewares.createLogger(logger, sharedState)); // TODO: shared state here is odd
        api.use(middlewares.createRequestValidator(validator));
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

class InboundServer {
    constructor(conf) {
        this._conf = conf;
        this._validator = new Validate();
        this._logger = InboundServer._CreateLogger(conf);
        this._api = new InboundApi(conf, this._logger, this._validator);
        this._server = this._createServer(
            conf.tls.inbound.mutualTLS.enabled,
            conf.tls.inbound.creds,
            this._api.callback()
        );
    }

    // TODO: there are two pieces of evidence that we should be passing the logger to the server
    // constructors:
    // 1. managing the logger lifetime here
    // 2. its config is not inbound server specific
    static _CreateLogger(conf) {
        return new Logger.Logger({
            context: {
                app: 'mojaloop-sdk-inbound-api',
            },
            stringify: Logger.buildStringify({
                space: conf.logIndent,
            })
        });
    }

    async start() {
        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);
        await this._api.start();
        await new Promise((resolve) => this._server.listen(this._conf.inboundPort, resolve));
        this._logger.log(`Serving inbound API on port ${this._conf.inboundPort}`);
    }

    async stop() {
        if (!this._server) {
            return;
        }
        await this._api.stop();
        await new Promise(resolve => this._server.close(resolve));
        console.log('inbound shut down complete');
    }

    async reconfigure(conf) {
        assert(
            this._conf.tls.inbound.mutualTLS.enabled === conf.tls.inbound.mutualTLS.enabled,
            'Cannot live restart an HTTPS server as HTTP or vice versa',
        );
        this._logger = InboundServer._CreateLogger(conf);
        const api = new InboundApi(conf, this._logger, this._validator);
        this._server.removeAllListeners('request');
        this._server.on('request', api.callback());
        this._api.stop();
        this._api = api;
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
