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

const { WSO2Auth, Logger } = require('@mojaloop/sdk-standard-components');
const Cache = require('@internal/cache');

const Validate = require('@internal/validate');
const router = require('@internal/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');

const endpointRegex = /\/.*/g;

class OutboundServer {
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._server = null;
        this._logger = null;
    }

    async setupApi() {
        this._api = new Koa();
        this._logger = new Logger.Logger({
            context: {
                app: 'mojaloop-sdk-outbound-api'
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

        this._wso2Auth = new WSO2Auth({
            ...this._conf.wso2Auth,
            logger: this._logger,
            tlsCreds: this._conf.tls.outbound.mutualTLS.enabled && this._conf.tls.outbound.creds,
        });

        this._api.use(middlewares.createErrorHandler());

        // outbound always expects application/json
        this._api.use(koaBody());

        const sharedState = { cache: this._cache, wso2Auth: this._wso2Auth, conf: this._conf };
        this._api.use(middlewares.createLogger(this._logger, sharedState));

        //Note that we strip off any path on peerEndpoint config after the origin.
        //this is to allow proxy routed requests to hit any path on the peer origin
        //irrespective of any base path on the PEER_ENDPOINT setting
        if (this._conf.proxyConfig) {
            this._api.use(middlewares.createProxy({
                ...this._conf,
                peerEndpoint: this._conf.peerEndpoint.replace(endpointRegex, ''),
                proxyConfig: this._conf.proxyConfig,
                logger: this._logger,
                wso2Auth: this._wso2Auth,
            }));
        }

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));

        this._server = this._createServer();
        return this._server;
    }

    async start() {
        await this._cache.connect();
        if (!this._conf.testingDisableWSO2AuthStart) {
            await this._wso2Auth.start();
        }
        await new Promise((resolve) => this._server.listen(this._conf.outboundPort, resolve));
        this._logger.log(`Serving outbound API on port ${this._conf.outboundPort}`);
    }

    async stop() {
        if (!this._server) {
            return;
        }
        await new Promise(resolve => this._server.close(resolve));
        this._wso2Auth.stop();
        await this._cache.disconnect();
        console.log('outbound shut down complete');
    }

    _createCache() {
        return new Cache({
            ...this._conf.cacheConfig,
            logger: this._logger.push({ component: 'cache' })
        });
    }

    async _createLogger() {
        // Set up a logger for each running server
        return ;
    }

    _createServer() {
        return http.createServer(this._api.callback());
    }
}

module.exports = OutboundServer;
