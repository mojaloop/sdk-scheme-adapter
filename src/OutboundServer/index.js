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

const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

const endpointRegex = /\/.*/g;

class OutboundApi {
    constructor(conf, logger, cache, validator) {
        this._logger = logger.push({ component: 'api' });
        this._api = new Koa();
        this._conf = conf;
        this._cache = cache;

        this._wso2Auth = new WSO2Auth({
            ...this._conf.wso2Auth,
            logger: this._logger,
            tlsCreds: this._conf.tls.outbound.mutualTLS.enabled && this._conf.tls.outbound.creds,
        });

        this._api.use(middlewares.createErrorHandler());
        this._api.use(middlewares.createRequestIdGenerator());
        this._api.use(koaBody()); // outbound always expects application/json
        this._api.use(middlewares.applyState({ cache, wso2Auth: this._wso2Auth, conf }));
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
                wso2Auth: this._wso2Auth,
            }));
        }

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
    }

    async start() {
        await this._cache.connect();
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2Auth.start();
        }
        this._wso2Auth.start();
    }

    async stop() {
        await this._cache.disconnect();
        this._wso2Auth.stop();
    }

    callback() {
        return this._api.callback();
    }
}

class OutboundServer {
    constructor(conf, logger, cache) {
        this._validator = new Validate();
        this._conf = conf;
        this._logger = logger.push({ app: 'mojaloop-sdk-outbound-api' });
        this._server = null;
        this._api = new OutboundApi(conf, this._logger, cache, this._validator);
        this._server = http.createServer(this._api.callback());
    }

    async start() {
        await this._api.start();

        const specPath = path.join(__dirname, 'api.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);

        await new Promise((resolve) => this._server.listen(this._conf.outboundPort, resolve));

        this._logger.log(`Serving outbound API on port ${this._conf.outboundPort}`);
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
}

module.exports = OutboundServer;
