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

const Validate = require('../lib/validate');
const router = require('../lib/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

const logExcludePaths = ['/'];

class InboundApi extends EventEmitter {
    constructor(conf, logger, cache, validator, wso2) {
        super({ captureExceptions: true });
        this._conf = conf;
        this._cache = cache;

        if (conf.validateInboundJws) {
            // peerJWSKey is a special config option specifically for Payment Manager for Mojaloop
            // that is populated by a management api.
            // This map supersedes local keys that would be loaded in by jwsVerificationKeysDirectory.
            this._jwsVerificationKeys = conf.pm4mlEnabled ? conf.peerJWSKeys : InboundApi._GetJwsKeys(conf.jwsVerificationKeysDirectory);
        }
        this._api = InboundApi._SetupApi({
            conf,
            logger,
            validator,
            cache,
            jwsVerificationKeys: this._jwsVerificationKeys,
            wso2,
        });
    }

    async start() {
        this._startJwsWatcher();
    }

    stop() {
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
        api.use(middlewares.createHeaderValidator(conf, logger));
        if (conf.validateInboundJws) {
            const jwsExclusions = conf.validateInboundPutPartiesJws ? [] : ['putParties'];
            api.use(middlewares.createJwsValidator(logger, jwsVerificationKeys, jwsExclusions));
        }

        api.use(middlewares.applyState({ cache, wso2, conf, logExcludePaths }));
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
    constructor(conf, logger, cache, wso2) {
        super({ captureExceptions: true });
        this._conf = conf;
        this._validator = new Validate({ logExcludePaths });
        this._logger = logger;
        this._api = new InboundApi(
            conf,
            this._logger.push({ component: 'api' }),
            cache,
            this._validator,
            wso2,
        );
        this._api.on('error', (...args) => {
            this.emit('error', ...args);
        });
        this._server = this._createServer(
            conf.inbound.tls.mutualTLS.enabled,
            conf.inbound.tls.creds,
            this._api.callback()
        );
    }

    async start() {
        assert(!this._server.listening, 'Server already listening');
        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);
        await this._api.start();
        await new Promise((resolve) => this._server.listen(this._conf.inbound.port, resolve));
        this._logger.isInfoEnabled() && this._logger.info(`Serving inbound API on port ${this._conf.inbound.port}`);
    }

    async stop() {
        if (this._server.listening) {
            await new Promise(resolve => this._server.close(resolve));
        }
        await this._api.stop();
        this._logger.isInfoEnabled() && this._logger.info('inbound shut down complete');
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
