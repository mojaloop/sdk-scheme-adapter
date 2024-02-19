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
const koaBody = require('koa-body').default;
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const Validate = require('../lib/validate');
const router = require('../lib/router');
const handlers = require('./handlers');
const middlewares = require('./middlewares');
const { KafkaDomainEventProducer, BC_CONFIG } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const { DefaultLogger } = require('@mojaloop/logging-bc-client-lib');

const endpointRegex = /\/.*/g;
const logExcludePaths = ['/'];

class OutboundApi extends EventEmitter {
    constructor(conf, logger, cache, validator, metricsClient, wso2, eventProducer, eventLogger) {
        super({ captureExceptions: true });
        this._logger = logger;
        this._api = new Koa();
        this._conf = conf;
        this._cache = cache;
        this._metricsClient = metricsClient;

        this._api.use(middlewares.createErrorHandler(this._logger));
        this._api.use(middlewares.createRequestIdGenerator());
        this._api.use(koaBody({ formidable: { maxFieldsSize: conf.backendApiServerMaxRequestBytes } })); // outbound always expects application/json
        this._api.use(middlewares.applyState({ cache, wso2, conf, metricsClient, logExcludePaths, eventProducer, eventLogger }));
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
                wso2: wso2,
                tls: conf.outbound.tls,
            }));
        }

        this._api.use(middlewares.createRequestValidator(validator));
        this._api.use(router(handlers));
    }

    start() {}

    stop() {}

    callback() {
        return this._api.callback();
    }
}

class OutboundServer extends EventEmitter {
    constructor(conf, logger, cache, metricsClient, wso2) {
        super({ captureExceptions: true });
        this._validator = new Validate({ logExcludePaths });
        this._conf = conf;
        this._logger = logger;
        this._server = null;
        if (conf.backendEventHandler.enabled) {
            this._eventLogger = new DefaultLogger(BC_CONFIG.bcName, 'backend-api-handler', '0.0.1', conf.logLevel);
            this._eventProducer = new KafkaDomainEventProducer(conf.backendEventHandler.domainEventProducer, this._eventLogger);
            this._eventLogger.info(`Created Message Producer of type ${this._eventProducer.constructor.name}`);
        }
        this._api = new OutboundApi(
            conf,
            this._logger.push({ component: 'api' }),
            cache,
            this._validator,
            metricsClient,
            wso2,
            this._eventProducer,
            this._eventLogger,
        );
        this._api.on('error', (...args) => {
            this.emit('error', ...args);
        });
        this._server = http.createServer(this._api.callback());
    }

    async start() {
        await this._eventProducer?.init();
        const specPath = path.join(path.dirname(require.resolve('@mojaloop/api-snippets')), '../docs/sdk-scheme-adapter-outbound-v2_0_0-openapi3-snippets.yaml');
        const apiSpecs = yaml.load(fs.readFileSync(specPath));
        await this._validator.initialise(apiSpecs);
        await this._api.start();
        await new Promise((resolve) => this._server.listen(this._conf.outbound.port, resolve));
        this._logger.info(`Serving outbound API on port ${this._conf.outbound.port}`);
    }

    async stop() {
        if (this._server.listening) {
            await new Promise(resolve => this._server.close(resolve));
        }
        await this._api.stop();
        await this._eventProducer?.destroy();
        this._logger.info('outbound shut down complete');
    }
}

module.exports = OutboundServer;
