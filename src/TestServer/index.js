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

const assert = require('assert').strict;
const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');

const { Logger } = require('@mojaloop/sdk-standard-components');
const Cache = require('@internal/cache');
const check = require('@internal/check');

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

class TestApi {
    constructor(conf, logger, validator, cache) {
        this._api = new Koa();

        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        // TODO: what exactly is this?
        const sharedState = { cache, conf };
        this._api.use(middlewares.createLogger(logger, sharedState));

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
        this._api.use(middlewares.createResponseBodyHandler());
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
            this._logger.push({ err })
                .log('Unhandled websocket error occurred. Shutting down.');
            process.exit(1);
        });

        this.on('connection', (socket, req) => {
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
    }

    async start() {
        await this._cache.connect();
        await this._cache.subscribe(this._cache.EVENT_SET, this._handleCacheKeySet.bind(this));
        await this._cache.setTestMode(true);
    }

    // Close the server then wait for all the client sockets to close
    async stop() {
        await new Promise(resolve => this.close(resolve));
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

class TestServer {
    constructor(conf, logger, cache) {
        this._conf = conf;
        this._logger = logger.push({ app: 'mojaloop-sdk-test-api' });
        this._validator = new Validate();
        this._api = new TestApi(conf, this._logger, this._validator, cache);
        this._server = this._createHttpServer(
            conf.tls.test.mutualTLS.enabled,
            conf.tls.test.creds,
            this._api.callback(),
        );
        // TODO: why does this appear to need to be called before this._createHttpServer (try
        // reorder it then run the tests)
        this._wsapi = new WsServer(this._logger.push({ component: 'websocket-server' }), cache);
    }

    async start() {
        if (this._server.listening) {
            return;
        }
        const fileData = await fs.readFile(path.join(__dirname, 'api.yaml'));
        await this._validator.initialise(yaml.load(fileData));

        await this._wsapi.start();

        this._server.on('upgrade', (req, socket, head) => {
            this._wsapi.handleUpgrade(req, socket, head, (ws) =>
                this._wsapi.emit('connection', ws, req));
        });

        await new Promise((resolve) => this._server.listen(this._conf.testPort, resolve));

        this._logger.log(`Serving test API on port ${this._conf.testPort}`);
    }

    async stop() {
        if (this._wsapi) {
            this._logger.log('Shutting down websocket server');
            this._wsapi.stop();
            this._wsapi = null;
        }
        if (this._server) {
            this._logger.log('Shutting down http server');
            await new Promise(resolve => this._server.close(resolve));
            this._server = null;
        }
        this._logger.log('Test server shutdown complete');
    }

    _createHttpServer(tlsEnabled, tlsCreds, handler) {
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

module.exports = TestServer;
