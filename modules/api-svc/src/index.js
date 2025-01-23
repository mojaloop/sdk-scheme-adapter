/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const { hostname } = require('os');
const EventEmitter = require('events');
const _ = require('lodash');
const { Logger } = require('@mojaloop/sdk-standard-components');
const { name, version } = require('../../../package.json');

const config = require('./config');
const InboundServer = require('./InboundServer');
const OutboundServer = require('./OutboundServer');
const OAuthTestServer = require('./OAuthTestServer');
const { BackendEventHandler } = require('./BackendEventHandler');
const { FSPIOPEventHandler } = require('./FSPIOPEventHandler');
const { MetricsServer, MetricsClient } = require('./lib/metrics');
const TestServer = require('./TestServer');
const ControlAgent = require('./ControlAgent');

// import things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
const InboundServerMiddleware = require('./InboundServer/middlewares.js');
const OutboundServerMiddleware = require('./OutboundServer/middlewares.js');
const Router = require('./lib/router');
const Validate = require('./lib/validate');
const Cache = require('./lib/cache');
const { SDKStateEnum } = require('./lib/model/common');
const { createAuthClient } = require('./lib/utils');
const { SDK_LOGGER_HIERARCHY } = require('./constants');

const LOG_ID = {
    INBOUND:   { app: 'mojaloop-connector-inbound-api' },
    OUTBOUND:  { app: 'mojaloop-connector-outbound-api' },
    BACKEND_EVENT_HANDLER:  { app: 'backend-event-handler' },
    FSPIOP_EVENT_HANDLER:  { app: 'fspiop-event-handler' },
    TEST:      { app: 'mojaloop-connector-test-api' },
    OAUTHTEST: { app: 'mojaloop-connector-oauth-test-server' },
    CONTROL:   { app: 'mojaloop-connector-control-client' },
    METRICS:   { app: 'mojaloop-connector-metrics' },
    CACHE:     { component: 'cache' },
};

const createLogger = (conf) => new Logger.Logger({
    context: {
        // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
        simulator: process.env['SIM_NAME'],
        hostname: hostname(),
    },
    opts: {
        levels: SDK_LOGGER_HIERARCHY.slice(SDK_LOGGER_HIERARCHY.indexOf(conf.logLevel)),
        isJsonOutput: conf.isJsonOutput,
    },
    stringify: Logger.buildStringify({ isJsonOutput: conf.isJsonOutput }),
});

const createCache = (config, logger) => new Cache({
    cacheUrl: config.cacheUrl,
    logger: logger.push(LOG_ID.CACHE),
    enableTestFeatures: config.enableTestFeatures,
    subscribeTimeoutSeconds:  config.requestProcessingTimeoutSeconds,
});

/**
 * Class that creates and manages http servers that expose the scheme adapter APIs.
 */
class Server extends EventEmitter {
    constructor(conf, logger) {
        super({ captureExceptions: true });
        this.conf = conf;
        this.logger = logger;
        this.cache = createCache(conf, logger);

        this.metricsClient = new MetricsClient();

        this.metricsServer = new MetricsServer({
            port: this.conf.metrics.port,
            logger: this.logger.push(LOG_ID.METRICS)
        });

        this.wso2 = createAuthClient(conf, logger);
        this.wso2.auth.on('error', (msg) => {
            this.emit('error', 'WSO2 auth error in InboundApi', msg);
        });

        this.inboundServer = new InboundServer(
            this.conf,
            this.logger.push(LOG_ID.INBOUND),
            this.cache,
            this.wso2,
        );
        this.inboundServer.on('error', (...args) => {
            this.logger.isErrorEnabled && this.logger.push({ args }).error('Unhandled error in Inbound Server');
            this.emit('error', 'Unhandled error in Inbound Server');
        });

        this.outboundServer = new OutboundServer(
            this.conf,
            this.logger.push(LOG_ID.OUTBOUND),
            this.cache,
            this.metricsClient,
            this.wso2,
        );
        this.outboundServer.on('error', (...args) => {
            this.logger.isErrorEnabled && this.logger.push({ args }).error('Unhandled error in Outbound Server');
            this.emit('error', 'Unhandled error in Outbound Server');
        });

        if (this.conf.oauthTestServer.enabled) {
            this.oauthTestServer = new OAuthTestServer({
                clientKey: this.conf.oauthTestServer.clientKey,
                clientSecret: this.conf.oauthTestServer.clientSecret,
                port: this.conf.oauthTestServer.listenPort,
                logger: this.logger.push(LOG_ID.OAUTHTEST),
            });
        }

        if (this.conf.enableTestFeatures) {
            this.testServer = new TestServer({
                config: this.conf,
                port: this.conf.test.port,
                logger: this.logger.push(LOG_ID.TEST),
                cache: this.cache,
            });
        }

        if (this.conf.backendEventHandler.enabled) {
            this.backendEventHandler = new BackendEventHandler({
                config: this.conf,
                logger: this.logger.push(LOG_ID.BACKEND_EVENT_HANDLER),
            });
        }

        if (this.conf.fspiopEventHandler.enabled) {
            this.fspiopEventHandler = new FSPIOPEventHandler({
                config: this.conf,
                logger: this.logger.push(LOG_ID.FSPIOP_EVENT_HANDLER),
                cache: this.cache,
                wso2: this.wso2,
            });
        }
    }

    async start() {
        await this.cache.connect();
        await this.wso2.auth.start();

        // We only start the control client if we're running within Mojaloop Payment Manager.
        // The control server is the Payment Manager Management API Service.
        // We only start the client to connect to and listen to the Management API service for
        // management protocol messages e.g configuration changes, certicate updates etc.
        if (this.conf.pm4mlEnabled) {
            const RESTART_INTERVAL_MS = 10000;
            this.controlClient = await ControlAgent.Client.Create({
                address: this.conf.control.mgmtAPIWsUrl,
                port: this.conf.control.mgmtAPIWsPort,
                logger: this.logger.push(LOG_ID.CONTROL),
                appConfig: this.conf,
            });
            this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this));
            this.controlClient.on('close', () => setTimeout(() => this.restart(_.merge({}, this.conf, { control: { stopped: Date.now() } })), RESTART_INTERVAL_MS));
        }

        await Promise.all([
            this.inboundServer.start(),
            this.outboundServer.start(),
            this.metricsServer.start(),
            this.testServer?.start(),
            this.oauthTestServer?.start(),
            this.backendEventHandler?.start(),
            this.fspiopEventHandler?.start(),
        ]);
    }

    async restart(newConf) {
        this.logger.isDebugEnabled && this.logger.debug('Server is restarting...');
        const updateLogger = !_.isEqual(newConf.isJsonOutput, this.conf.isJsonOutput);
        if (updateLogger) {
            this.logger = createLogger(newConf);
        }

        let oldCache;
        const updateCache = !_.isEqual(this.conf.cacheUrl, newConf.cacheUrl)
            || !_.isEqual(this.conf.enableTestFeatures, newConf.enableTestFeatures);
        if (updateCache) {
            oldCache = this.cache;
            await this.cache.disconnect();
            this.cache = createCache(newConf, this.logger);
            await this.cache.connect();
        }

        const updateWSO2 = !_.isEqual(this.conf.wso2, newConf.wso2)
            || !_.isEqual(this.conf.outbound.tls, newConf.outbound.tls);
        if (updateWSO2) {
            this.wso2.auth.stop();
            this.wso2 = createAuthClient(newConf, this.logger);
            this.wso2.auth.on('error', (msg) => {
                this.emit('error', 'WSO2 auth error in InboundApi', msg);
            });
            await this.wso2.auth.start();
        }

        const updateInboundServer = !_.isEqual(this.conf.inbound, newConf.inbound)
            || !_.isEqual(this.conf.outbound, newConf.outbound);
        if (updateInboundServer) {
            await this.inboundServer.stop();
            this.inboundServer = new InboundServer(
                newConf,
                this.logger.push(LOG_ID.INBOUND),
                this.cache,
                this.wso2,
            );
            this.inboundServer.on('error', (...args) => {
                const errMessage = 'Unhandled error in Inbound Server';
                this.logger.push({ args }).log(errMessage);
                this.emit('error', errMessage);
            });
            await this.inboundServer.start();
        }

        const updateOutboundServer = !_.isEqual(this.conf.outbound, newConf.outbound);
        if (updateOutboundServer) {
            await this.outboundServer.stop();
            this.outboundServer = new OutboundServer(
                newConf,
                this.logger.push(LOG_ID.OUTBOUND),
                this.cache,
                this.metricsClient,
                this.wso2,
            );
            this.outboundServer.on('error', (...args) => {
                const errMessage = 'Unhandled error in Outbound Server';
                this.logger.push({ args }).log(errMessage);
                this.emit('error', errMessage);
            });
            await this.outboundServer.start();
        }

        const updateFspiopEventHandler = !_.isEqual(this.conf.outbound, newConf.outbound)
            && this.conf.fspiopEventHandler.enabled;
        if (updateFspiopEventHandler) {
            await this.fspiopEventHandler.stop();
            this.fspiopEventHandler = new FSPIOPEventHandler({
                config: newConf,
                logger: this.logger.push(LOG_ID.FSPIOP_EVENT_HANDLER),
                cache: this.cache,
                wso2: this.wso2,
            });
            await this.fspiopEventHandler.start();
        }

        const updateControlClient = !_.isEqual(this.conf.control, newConf.control);
        if (updateControlClient) {
            await this.controlClient?.stop();
            if (this.conf.pm4mlEnabled) {
                const RESTART_INTERVAL_MS = 10000;
                this.controlClient = await ControlAgent.Client.Create({
                    address: newConf.control.mgmtAPIWsUrl,
                    port: newConf.control.mgmtAPIWsPort,
                    logger: this.logger.push(LOG_ID.CONTROL),
                    appConfig: newConf,
                });
                this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this));
                this.controlClient.on('close', () => setTimeout(() => {
                    this.restart(_.merge({}, newConf, {
                        control: { stopped: Date.now() }
                    }));
                }, RESTART_INTERVAL_MS));
            }
        }

        const updateOAuthTestServer = !_.isEqual(newConf.oauthTestServer, this.conf.oauthTestServer);
        if (updateOAuthTestServer) {
            await this.oauthTestServer?.stop();
            if (this.conf.oauthTestServer.enabled) {
                this.oauthTestServer = new OAuthTestServer({
                    clientKey: newConf.oauthTestServer.clientKey,
                    clientSecret: newConf.oauthTestServer.clientSecret,
                    port: newConf.oauthTestServer.listenPort,
                    logger: this.logger.push(LOG_ID.OAUTHTEST),
                });
                await this.oauthTestServer.start();
            }
        }

        const updateTestServer = !_.isEqual(newConf.test.port, this.conf.test.port);
        if (updateTestServer) {
            await this.testServer?.stop();
            if (this.conf.enableTestFeatures) {
                this.testServer = new TestServer({
                    port: newConf.test.port,
                    logger: this.logger.push(LOG_ID.TEST),
                    cache: this.cache,
                });
                await this.testServer.start();
            }
        }

        _.merge(this.conf, newConf);

        await Promise.all([
            oldCache?.disconnect(),
        ]);
        this.logger.isDebugEnabled && this.logger.debug('Server is restarted');
    }

    stop() {
        this.wso2.auth.stop();
        this.controlClient?.removeAllListeners();
        this.inboundServer.removeAllListeners();
        return Promise.all([
            this.cache.disconnect(),
            this.inboundServer.stop(),
            this.outboundServer.stop(),
            this.oauthTestServer?.stop(),
            this.testServer?.stop(),
            this.controlClient?.stop(),
            this.metricsServer.stop(),
            this.backendEventHandler?.stop(),
            this.fspiopEventHandler?.stop(),
        ]);
    }
}

/*
* Call the Connector Manager in Management API to get the updated config
*/
async function _GetUpdatedConfigFromMgmtAPI(conf, logger, client) {
    logger.isInfoEnabled && logger.info(`Getting updated config from Management API at ${conf.control.mgmtAPIWsUrl}:${conf.control.mgmtAPIWsPort}...`);
    const clientSendResponse = await client.send(ControlAgent.build.CONFIGURATION.READ());
    logger.isInfoEnabled && logger.info('client send returned:: ', clientSendResponse);
    const responseRead = await client.receive();
    logger.isInfoEnabled && logger.info('client receive returned:: ', responseRead);
    return responseRead.data;
}

async function start(config) {
    const logger = createLogger(config);

    if (config.pm4mlEnabled) {
        const controlClient = await ControlAgent.Client.Create({
            address: config.control.mgmtAPIWsUrl,
            port: config.control.mgmtAPIWsPort,
            logger: logger,
            appConfig: config,
        });
        const updatedConfigFromMgmtAPI = await _GetUpdatedConfigFromMgmtAPI(config, logger, controlClient);
        logger.isInfoEnabled && logger.push({ updatedConfigFromMgmtAPI }).info('updatedConfigFromMgmtAPI:');
        _.merge(config, updatedConfigFromMgmtAPI);
        controlClient.terminate();
    }
    const svr = new Server(config, logger);
    svr.on('error', (err) => {
        logger.push({ err }).error('Unhandled server error');
        process.exit(2);
    });

    // handle SIGTERM to exit gracefully
    process.on('SIGTERM', async () => {
        logger.isInfoEnabled && logger.info('SIGTERM received. Shutting down APIs...');
        await svr.stop();
        process.exit(0);
    });

    await svr.start().catch(err => {
        logger.push({ err }).error('Error starting server');
        process.exit(1);
    });

    logger.isInfoEnabled && logger.push({ name, version }).info('SDK server is started!');
}

if (require.main === module) {
    // this module is main i.e. we were started as a server;
    // not used in unit test or "require" scenarios
    start(config);
}


// export things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
module.exports = {
    Cache,
    ControlAgent,
    InboundServerMiddleware,
    OutboundServerMiddleware,
    Router,
    Server,
    Validate,
    SDKStateEnum,
    start,
    config,
};
