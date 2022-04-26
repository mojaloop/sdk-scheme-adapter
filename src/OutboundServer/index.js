/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

const http = require('http');

const Koa = require('koa');
const koaBody = require('koa-body');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const cors = require('@koa/cors');

const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const Validate = require('../lib/validate');
const router = require('../lib/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

const endpointRegex = /\/.*/g;

class OutboundApi extends EventEmitter {
    constructor(conf, logger, cache, validator) {
        super({ captureExceptions: true });
        this._logger = logger;
        this._api = new Koa();
        this._conf = conf;
        this._cache = cache;

        this._wso2 = {
            auth: new WSO2Auth({
                ...this._conf.wso2.auth,
                logger: this._logger,
                tlsCreds: this._conf.outbound.tls.mutualTLS.enabled && this._conf.outbound.tls.creds,
            }),
            retryWso2AuthFailureTimes: conf.wso2.requestAuthFailureRetryTimes,
        };
        this._wso2.auth.on('error', (msg) => {
            this.emit('error', 'WSO2 auth error in OutboundApi', msg);
        });

        // use CORS
        // https://github.com/koajs/cors
        this._api.use(cors());

        this._api.use(middlewares.createErrorHandler(this._logger));
        this._api.use(middlewares.createRequestIdGenerator());
        this._api.use(koaBody()); // outbound always expects application/json
        this._api.use(middlewares.applyState({ cache, wso2: this._wso2, conf }));
        this._api.use(middlewares.createLogger(this._logger));

        //Note that we strip off any path on peerEndpoint config after the origin.
        //this is to allow proxy routed requests to hit any path on the peer origin
        //irrespective of any base path on the PEER_ENDPOINT setting
        if (conf.proxyConfig) {
            this._api.use(middlewares.createProxy({
                ...conf,
                peerEndpoint: conf.peerEndpoint.replace(endpointRegex, ''),
                proxyConfig: conf.proxyConfig,
                logger: this._logger,
                wso2Auth: this._wso2.auth,
                tls: conf.outbound.tls,
            }));
        }

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
    }

    async start() {
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2.auth.start();
        }
    }

    async stop() {
        this._wso2.auth.stop();
    }

    callback() {
        return this._api.callback();
    }
}

class OutboundServer extends EventEmitter {
    constructor(conf, logger, cache) {
        super({ captureExceptions: true });
        this._validator = new Validate();
        this._conf = conf;
        this._logger = logger;
        this._server = null;
        this._api = new OutboundApi(
            conf,
            this._logger.push({ component: 'api' }),
            cache,
            this._validator
        );
        this._api.on('error', (...args) => {
            this.emit('error', ...args);
        });
        this._server = http.createServer(this._api.callback());
    }

    async start() {
        await this._api.start();
        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);
        await new Promise((resolve) => this._server.listen(this._conf.outbound.port, resolve));
        this._logger.log(`Serving outbound API on port ${this._conf.outbound.port}`);
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
        this._logger.log('Shut down complete');
    }

    async reconfigure(conf, logger, cache, metricsClient) {
        const newApi = new OutboundApi(conf, logger, cache, this._validator, metricsClient);
        await newApi.start();
        return () => {
            this._logger = logger;
            this._cache = cache;
            this._server.removeAllListeners('request');
            this._server.on('request', newApi.callback());
            this._api.stop();
            this._api = newApi;
            this._conf = conf;
            this._logger.log('restarted');
        };
    }
}

module.exports = OutboundServer;
