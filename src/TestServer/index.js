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
const ws = require('ws');

const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const { Logger } = require('@mojaloop/sdk-standard-components');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('../InboundServer/middlewares');

const getWsIp = (req) => [
    req.socket.remoteAddress,
    ...(
        req.headers['x-forwarded-for']
            ? req.headers['x-forwarded-for'].split(/\s*,\s*/)
            : []
    )
];

class TestServer {
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._server = null;
        this._logger = null;
    }

    async setupApi() {
        this._api = new Koa();
        this._wsClients = new Map();
        this._wsapi = this._createWsServer();

        this._logger = new Logger.Logger({
            context: {
                app: 'mojaloop-sdk-test-api'
            },
            stringify: Logger.buildStringify({
                space: this._conf.logIndent,
            })
        });

        this._cache = this._createCache();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        const validator = new Validate();
        await validator.initialise(apiSpecs);

        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        const sharedState = { cache: this._cache, conf: this._conf };
        this._api.use(middlewares.createLogger(this._logger, sharedState));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
        this._api.use(middlewares.createResponseBodyHandler());

        this._server = this._createServer();
        return this._server;
    }

    async start() {
        await this._cache.connect();
        this._cache.subscribe(this._cache.EVENT_SET, this._handleCacheKeySet.bind(this));
        this._cache.setTestMode(true);
        this._server.on('upgrade', (req, socket, head) => {
            this._wsapi.handleUpgrade(req, socket, head, (ws) =>
                this._wsapi.emit('connection', ws, req));
        });
        await new Promise((resolve) => this._server.listen(this._conf.testPort, resolve));
        this._logger.log(`Serving test API on port ${this._conf.testPort}`);
    }

    async stop() {
        if (!this._server) {
            return;
        }
        await new Promise(resolve => this._wsapi.close(resolve));
        // If we don't want for all clients to close before shutting down, the socket close
        // handlers will be called after we return from this function, resulting in behaviour
        // occurring after the server tells the user it has shutdown.
        await Promise.all([...this._wsClients.keys()].map(socket =>
            new Promise(resolve => socket.on('close', resolve))
        ));
        await new Promise(resolve => this._server.close(resolve));
        await this._cache.disconnect();
        console.log('api shut down complete');
    }

    _createCache() {
        return new Cache({
            ...this._conf.cacheConfig,
            logger: this._logger.push({ component: 'cache' })
        });
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

    _createWsServer() {
        const wss = new ws.Server({ noServer: true });

        wss.on('error', err => {
            // Curtains down
            this._logger.push({ err })
                .log('Unhandled websocket error occurred. Shutting down.');
            process.exit(1);
        });

        wss.on('connection', (socket, req) => {
            const logger = this._logger.push({
                url: req.url,
                ip: getWsIp(req),
                remoteAddress: req.socket.remoteAddress,
            });
            logger.log('Websocket connection received');
            this._wsClients.set(socket, req);
            socket.on('close', (code, reason) => {
                logger.push({ code, reason }).log('Websocket connection closed');
                this._wsClients.delete(socket);
            });
        });

        return wss;
    }

    // Send the received notification to subscribers where appropriate.
    async _handleCacheKeySet(channel, key, id) {
        const logger = this._logger.push({ key });
        logger.push({ channel, id }).log('Received Redis keyevent notification');

        // Only notify clients of callback and request keyevents, as we don't want to encourage
        // dependency on unintended behaviour (i.e. create a proxy Redis client by sending all
        // keyevent notifications to the client). Some of this is implicitly performed later in
        // this method, but we use the root path `/` to enable clients to subscribe to all events,
        // so we filter them here.
        const allowedPrefixes = [this._cache.CALLBACK_PREFIX, this._cache.REQUEST_PREFIX];
        if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
            logger.push({ allowedPrefixes })
                .log('Notification not of allowed message type. Ignored.');
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
                this._logger
                    .push({
                        url: req.url,
                        key,
                        ip: getWsIp(req),
                        value: keyData,
                        prefix,
                    })
                    .log('Pushing notification to subscribed client');
                socket.send(keyDataStr);
            }
        }
    }
}

module.exports = TestServer;
