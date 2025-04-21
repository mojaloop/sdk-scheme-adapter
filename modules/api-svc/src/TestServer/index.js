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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
const Koa = require('koa');
const ws = require('ws');

const http = require('http');
const yaml = require('js-yaml');
const path = require('path');

const Validate = require('../lib/validate');
const router = require('../lib/router');
const handlers = require('./handlers');
const middlewares = require('../InboundServer/middlewares');

const logExcludePaths = ['/'];
const _validator = new Validate({ logExcludePaths });
let _initialize;

const getWsIp = (req) => [
    req.socket.remoteAddress,
    ...(
        req.headers['x-forwarded-for']
            ? req.headers['x-forwarded-for'].split(/\s*,\s*/)
            : []
    )
];

class TestApi {
    constructor(logger, validator, cache, conf) {
        this._api = new Koa();

        this._api.use(middlewares.createErrorHandler(logger));
        this._api.use(middlewares.createRequestIdGenerator(logger));
        this._api.use(middlewares.applyState({ cache, logExcludePaths }));
        this._api.use(middlewares.createLogger(logger));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers, conf));
        this._api.use(middlewares.createResponseBodyHandler());
        this._api.use(middlewares.createResponseLogging(logger));
    }

    callback() {
        return this._api.callback();
    }
}

class WsServer extends ws.Server {
    constructor(logger, cache) {
        super({ noServer: true });
        this._wsClients = new Map();
        this._logger = logger;
        this._cache = cache;

        this.on('error', err => {
            this._logger.isErrorEnabled && this._logger.push({ error: err })
                .error('Unhandled websocket error occurred. Shutting down.');
            process.exit(1);
        });

        this.on('connection', (socket, req) => {
            const logger = this._logger.push({
                url: req.url,
                ip: getWsIp(req),
                remoteAddress: req.socket.remoteAddress,
            });
            logger.isDebugEnabled && logger.debug('Websocket connection received');
            this._wsClients.set(socket, req);
            socket.on('close', (code, reason) => {
                logger.isDebugEnabled && logger.push({ code, reason }).debug('Websocket connection closed');
                this._wsClients.delete(socket);
            });
        });
    }

    async start() {
        await this._cache.subscribe(this._cache.EVENT_SET, this._handleCacheKeySet.bind(this));
    }

    // Close the server then wait for all the client sockets to close
    async stop() {
        const closing = new Promise(resolve => this.close(resolve));
        for (const client of this.clients) {
            client.terminate();
        }
        await closing;
        // If we don't wait for all clients to close before shutting down, the socket close
        // handlers will be called after we return from this function, resulting in behaviour
        // occurring after the server tells the user it has shutdown.
        await Promise.all([...this._wsClients.keys()].map(socket =>
            new Promise(resolve => socket.on('close', resolve))
        ));
    }

    // Send the received notification to subscribers where appropriate.
    async _handleCacheKeySet(channel, key, id) {
        const logger = this._logger.push({ key });
        logger.push({ channel, id }).debug('Received Redis keyevent notification');

        // Only notify clients of callback and request keyevents, as we don't want to encourage
        // dependency on unintended behaviour (i.e. create a proxy Redis client by sending all
        // keyevent notifications to the client). Some of this is implicitly performed later in
        // this method, but we use the root path `/` to enable clients to subscribe to all events,
        // so we filter them here.
        const allowedPrefixes = [this._cache.CALLBACK_PREFIX, this._cache.REQUEST_PREFIX];
        if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
            logger.isDebugEnabled && logger.push({ allowedPrefixes })
                .debug('Notification not of allowed message type. Ignored.');
            return;
        }

        // Map urls to callback prefixes. For example, as a user of this service, if I want to
        // subscribe to Redis keyevent notifications with the prefix this._cache.REQUEST_PREFIX (at
        // the time of writing, that's 'request_') then I'll connect to `ws://this-server/requests`.
        // The map here defines that mapping, and exists to decouple the interface (the url) from
        // the implementation (the "callback prefix").
        const endpoints = {
            REQUEST: '/requests',
            CALLBACK: '/callbacks',
        };
        const urlToMsgPrefixMap = new Map([
            [endpoints.REQUEST, this._cache.REQUEST_PREFIX],
            [endpoints.CALLBACK, this._cache.CALLBACK_PREFIX],
        ]);
        let keyData; // declare outside the loop here, then retrieve at most once
        let keyDataStr;
        for (let [socket, req] of this._wsClients) {
            // If
            // - the url is the catch-all root (i.e. `ws://this-server/`), or
            // - the url corresponds (via urlToMsgPrefixMap) to the message prefix for this
            //   message. E.g. if the url is /callbacks and the key is
            //   `${this._cache.CALLBACK_PREFIX}whatever`, or
            // - the url matches the key, e.g. we replace the url prefix with the key prefix and
            //   obtain a match. E.g. the url is /callbacks/hello and the key is callback_hello.
            // send the message to the client.
            const prefix = urlToMsgPrefixMap.get(req.url);
            const urlMatchesPrefix = urlToMsgPrefixMap.has(req.url) && key.startsWith(prefix);
            const urlMatchesKey =
                req.url.replace(new RegExp(`^${endpoints.REQUEST}/`), this._cache.REQUEST_PREFIX) === key ||
                req.url.replace(new RegExp(`^${endpoints.CALLBACK}/`), this._cache.CALLBACK_PREFIX) === key;
            if (req.url === '/' || urlMatchesPrefix || urlMatchesKey) {
                if (!keyData || !keyDataStr) {
                    // Strip off the prefix and send the user the id
                    const requestId = [...urlToMsgPrefixMap.values()].reduce(
                        (key, prefix) => key.replace(new RegExp(`^${prefix}`), ''),
                        key
                    );
                    keyData = await this._cache.get(key);
                    keyDataStr = JSON.stringify({
                        ...keyData,
                        id: requestId,
                    });
                }
                this._logger.isDebugEnabled && this._logger
                    .push({
                        url: req.url,
                        key,
                        ip: getWsIp(req),
                        value: keyData,
                        prefix,
                    })
                    .debug('Pushing notification to subscribed client');
                socket.send(keyDataStr);
            }
        }
    }
}

class TestServer {
    constructor({ port, logger, cache, config }) {
        _initialize ||= _validator.initialise(yaml.load(require('fs').readFileSync(path.join(__dirname, 'api.yaml'))), config);
        this._port = port;
        this._logger = logger.push({ app: this.constructor.name });
        this._api = new TestApi(this._logger.push({ component: 'TestApi' }), _validator, cache, config);
        this._server = http.createServer(this._api.callback());
        // TODO: why does this appear to need to be called after creating this._server (try reorder
        // it then run the tests)
        this._wsapi = new WsServer(this._logger.push({ component: 'WsServer' }), cache);
    }

    async start() {
        if (this._server.listening) {
            return;
        }

        await _initialize;

        await this._wsapi.start();

        this._server.on('upgrade', (req, socket, head) => {
            this._wsapi.handleUpgrade(req, socket, head, (ws) =>
                this._wsapi.emit('connection', ws, req));
        });

        await new Promise((resolve) => this._server.listen(this._port, resolve));

        this._logger.isInfoEnabled && this._logger.info(`Serving test API on port ${this._port}`);
    }

    async stop() {
        if (this._wsapi) {
            this._logger.isInfoEnabled && this._logger.info('Shutting down websocket server');
            await this._wsapi.stop();
            this._wsapi = null;
        }
        if (this._server) {
            this._logger.isInfoEnabled && this._logger.info('Shutting down http server');
            await new Promise(resolve => this._server.close(resolve));
            this._server = null;
        }
        this._logger.isInfoEnabled && this._logger.info('Test server shutdown complete');
    }
}

module.exports = TestServer;
