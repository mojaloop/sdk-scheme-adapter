/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <james.bus@mojaloop.io>

 --------------
 ******/
const Koa = require('koa');

const _ = require('lodash');
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

const { inboundOpenApiFilename } = require('../config');
const specPath = path.resolve(__dirname, inboundOpenApiFilename);
const apiSpecs = yaml.load(fs.readFileSync(specPath));

const logExcludePaths = ['/'];
const _validator = new Validate({ logExcludePaths });
let _initialize;

class InboundApi extends EventEmitter {
    constructor(conf, logger, cache, validator, wso2) {
        super({ captureExceptions: true });
        this._conf = conf;
        this._cache = cache;
        this._logger = logger;
        _initialize ||= _validator.initialise(apiSpecs, conf);

        if (conf.validateInboundJws) {
            // peerJWSKey is a special config option specifically for Payment Manager for Mojaloop
            // that is populated by a management api.
            // This map supersedes local keys that would be loaded in by jwsVerificationKeysDirectory.
            this._jwsVerificationKeys = conf.pm4mlEnabled ? conf.peerJWSKeys : InboundApi._GetJwsKeys(conf.jwsVerificationKeysDirectory);
        }
        this._api = InboundApi._SetupApi({
            conf,
            logger: logger.push({ component: this.constructor.name }),
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

    _updatePeerJwsKeys(peerJwsKeys) {
        if (this._conf.pm4mlEnabled && !_.isEqual(this._jwsVerificationKeys, peerJwsKeys) &&
            this._jwsVerificationKeys && typeof this._jwsVerificationKeys === 'object') {
            this._logger && this._logger.isVerboseEnabled && this._logger.verbose('Clearing existing JWS verification keys');
            Object.keys(this._jwsVerificationKeys).forEach(key => delete this._jwsVerificationKeys[key]);
            this._logger && this._logger.isVerboseEnabled && this._logger.verbose('Assigning new peer JWS keys');
            Object.assign(this._jwsVerificationKeys, peerJwsKeys);
        }
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
        api.use(middlewares.createRequestIdGenerator(logger));
        api.use(middlewares.createLogger(logger));
        api.use(middlewares.createHeaderValidator(conf));
        if (conf.validateInboundJws) {
            const jwsExclusions = conf.validateInboundPutPartiesJws ? [] : ['putParties'];
            api.use(middlewares.createJwsValidator(logger, jwsVerificationKeys, jwsExclusions));
        }

        api.use(middlewares.applyState({ conf, cache, wso2, logExcludePaths }));
        api.use(middlewares.createPingMiddleware(conf, jwsVerificationKeys));
        api.use(middlewares.createRequestValidator(validator));
        api.use(middlewares.assignFspiopIdentifier());
        if (conf.enableTestFeatures) {
            api.use(middlewares.cacheRequest(cache));
        }
        api.use(router(handlers, conf));
        api.use(middlewares.createResponseBodyHandler());
        api.use(middlewares.createResponseLogging());

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
        this._logger = logger.push({ app: this.constructor.name });
        this._api = new InboundApi(
            conf,
            this._logger,
            cache,
            _validator,
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
        await _initialize;
        await this._api.start();
        await new Promise((resolve) => this._server.listen(this._conf.inbound.port, resolve));
        this._logger.isInfoEnabled && this._logger.info(`Serving inbound API on port ${this._conf.inbound.port}`);
    }

    async stop() {
        if (this._server.listening) {
            await new Promise(resolve => {
                this._server.close(() => {
                    this._logger.isDebugEnabled && this._logger.debug('inbound API is closed');
                    resolve();
                });
                this._server.closeAllConnections();
            });
        }
        await this._api.stop();
        this._logger.isInfoEnabled && this._logger.info('inbound API shut down complete');
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
