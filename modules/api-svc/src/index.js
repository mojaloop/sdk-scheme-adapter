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

const assert = require('assert/strict');
const { hostname } = require('os');
const config = require('./config');
const EventEmitter = require('events');
const _ = require('lodash');

const InboundServer = require('./InboundServer');
const OutboundServer = require('./OutboundServer');
const OAuthTestServer = require('./OAuthTestServer');
const TestServer = require('./TestServer');
const { MetricsServer, MetricsClient } = require('./lib/metrics');
const ControlAgent = require('./ControlAgent');

// import things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
const InboundServerMiddleware = require('./InboundServer/middlewares.js');
const OutboundServerMiddleware = require('./OutboundServer/middlewares.js');
const Router = require('./lib/router');
const Validate = require('./lib/validate');
const Cache = require('./lib/cache');
const check = require('./lib/check');
const { Logger } = require('@mojaloop/sdk-standard-components');

const LOG_ID = {
    INBOUND:   { app: 'mojaloop-connector-inbound-api' },
    OUTBOUND:  { app: 'mojaloop-connector-outbound-api' },
    TEST:      { app: 'mojaloop-connector-test-api' },
    OAUTHTEST: { app: 'mojaloop-connector-oauth-test-server' },
    CONTROL:   { app: 'mojaloop-connector-control-client' },
    METRICS:   { app: 'mojaloop-connector-metrics' },
    CACHE:     { component: 'cache' },
};

/**
 * Class that creates and manages http servers that expose the scheme adapter APIs.
 */
class Server extends EventEmitter {
    constructor(conf, logger) {
        super({ captureExceptions: true });
        this.conf = conf;
        this.logger = logger;
        this.cache = new Cache({
            ...conf.cacheConfig,
            logger: this.logger.push(LOG_ID.CACHE),
            enableTestFeatures: conf.enableTestFeatures,
        });

        this.metricsClient = new MetricsClient();

        this.metricsServer = new MetricsServer({
            port: this.conf.metrics.port,
            logger: this.logger.push(LOG_ID.METRICS)
        });

        this.inboundServer = new InboundServer(
            this.conf,
            this.logger.push(LOG_ID.INBOUND),
            this.cache,
            this.metricsClient
        );
        this.inboundServer.on('error', (...args) => {
            this.logger.push({ args }).log('Unhandled error in Inbound Server');
            this.emit('error', 'Unhandled error in Inbound Server');
        });

        this.outboundServer = new OutboundServer(
            this.conf,
            this.logger.push(LOG_ID.OUTBOUND),
            this.cache,
            this.metricsClient
        );
        this.outboundServer.on('error', (...args) => {
            this.logger.push({ args }).log('Unhandled error in Outbound Server');
            this.emit('error', 'Unhandled error in Outbound Server');
        });

        this.oauthTestServer = new OAuthTestServer({
            clientKey: this.conf.oauthTestServer.clientKey,
            clientSecret: this.conf.oauthTestServer.clientSecret,
            port: this.conf.oauthTestServer.listenPort,
            logger: this.logger.push(LOG_ID.OAUTHTEST),
        });

        this.testServer = new TestServer({
            port: this.conf.test.port,
            logger: this.logger.push(LOG_ID.TEST),
            cache: this.cache,
        });
    }

    async restart(newConf) {
        // Figuring out what config is necessary in each server and component is a pretty big job
        // that we'll have to save for later. For now, when the config changes, we'll restart
        // more than we might have to.
        // We'll do this by:
        // 0. creating a new instance of the logger, if necessary
        // 1. creating a new instance of the cache, if necessary
        // 2. calling the async reconfigure method of each of the servers as necessary- this will
        //    return a synchronous function that we can call to swap over the server events and
        //    object properties to the new ones. It will:
        //    1. remove the `request` listener for each of the HTTP servers
        //    2. add the new appropriate `request` listener
        //    This results in a completely synchronous listener changeover to the new config and
        //    therefore hopefully avoids any concurrency issues arising from restarting different
        //    servers or components concurrently.
        // TODO: in the sense of being able to reason about the code, it would make some sense to
        // turn the config items or object passed to each server into an event emitter, or pass an
        // additional event emitter to the server constructor for the server to listen to and act
        // on changes. Before this, however, it's probably necessary to ensure each server gets
        // _only_ the config it needs, not the entire config object.
        // Further: it might be possible to use Object.observe for this functionality.
        // TODO: what happens if this is run concurrently? I.e. if it is called twice in rapid
        // succession. This question probably needs to be asked of the reconfigure message on every
        // server.
        // Note that it should be possible to reconfigure ports on a running server by reassigning
        // servers, e.g.
        //   this.inboundServer._server = createHttpServer();
        //   this.inboundServer._server.listen(newPort);
        // If there are conflicts, for example if the new configuration specifies the new inbound
        // port to be the same value as the old outbound port, this will require either
        // 1. some juggling of HTTP servers, e.g.
        //      const oldInboundServer = this.inboundServer._server;
        //      this.inboundServer._server = this.outboundServer._server;
        //    .. etc.
        // 2. some juggling of sockets between servers, if possible
        // 3. rearchitecting of the servers, perhaps splitting the .start() method on the servers
        //    to an .init() and .listen() methods, with the latter optionally taking an HTTP server
        //    as argument
        // This _might_ introduce some confusion/complexity for existing websocket clients, but as
        // the event handlers _should_ not be modified this shouldn't be a problem. A careful
        // analysis of this will be necessary.
        assert(newConf.inbound.port === this.conf.inbound.port
            && newConf.outbound.port === this.conf.outbound.port
            && newConf.test.port === this.conf.test.port
            && newConf.oauthTestServer.listenPort === this.conf.oauthTestServer.listenPort
            && newConf.control.mgmtAPIWsPort === this.conf.control.mgmtAPIWsPort,
        'Cannot reconfigure ports on running server');
        const doNothing = () => {};
        const updateLogger = check.notDeepEqual(newConf.logIndent, this.conf.logIndent);
        if (updateLogger) {
            this.logger = new Logger.Logger({
                context: {
                    // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
                    simulator: process.env['SIM_NAME'],
                    hostname: hostname(),
                },
                stringify: Logger.buildStringify({ space: this.conf.logIndent }),
            });
        }
        let oldCache;
        const updateCache = (
            updateLogger ||
            check.notDeepEqual(this.conf.cacheConfig, newConf.cacheConfig) ||
            check.notDeepEqual(this.conf.enableTestFeatures, newConf.enableTestFeatures)
        );
        if (updateCache) {
            oldCache = this.cache;
            this.cache = new Cache({
                ...newConf.cacheConfig,
                logger: this.logger.push(LOG_ID.CACHE),
                enableTestFeatures: newConf.enableTestFeatures,
            });
            await this.cache.connect();
        }
        const confChanged = !check.deepEqual(newConf, this.conf);
        // TODO: find better naming than "restart", because that's not really what's happening.
        const [restartInboundServer, restartOutboundServer, restartControlClient] = confChanged
            ? await Promise.all([
                this.inboundServer.reconfigure(newConf, this.logger.push(LOG_ID.INBOUND), this.cache),
                this.outboundServer.reconfigure(newConf, this.logger.push(LOG_ID.OUTBOUND), this.cache, this.metricsClient),
                this.controlClient.reconfigure({
                    logger: this.logger.push(LOG_ID.CONTROL),
                    port: newConf.control.mgmtAPIWsPort,
                    appConfig: newConf
                }),
            ])
            : [doNothing, doNothing, doNothing];
        const updateOAuthTestServer = (
            updateLogger || check.notDeepEqual(newConf.oauthTestServer, this.conf.oauthTestServer)
        );
        const restartOAuthTestServer = updateOAuthTestServer
            ? await this.oauthTestServer.reconfigure({
                clientKey: this.conf.oauthTestServer.clientKey,
                clientSecret: this.conf.oauthTestServer.clientSecret,
                port: this.conf.oauthTestServer.listenPort,
                logger: this.logger.push(LOG_ID.OAUTHTEST),
            })
            : doNothing;
        const updateTestServer = (
            updateLogger || updateCache || check.notDeepEqual(newConf.test.port, this.conf.test.port)
        );
        const restartTestServer = updateTestServer
            ? await this.testServer.reconfigure({
                port: newConf.test.port,
                logger: this.logger.push(LOG_ID.TEST),
                cache: this.cache,
            })
            : doNothing;
        // You may not return an async restart function. Perform any required async activity in the
        // reconfigure function and return a sync restart function. See the note at the top of this
        // file.
        [restartTestServer, restartOAuthTestServer, restartInboundServer, restartOutboundServer, restartControlClient]
            .map(f => assert(Promise.resolve(f) !== f, 'Restart functions must be synchronous'));
        restartTestServer();
        restartOAuthTestServer();
        restartInboundServer();
        restartOutboundServer();
        restartControlClient();
        this.conf = newConf;
        await Promise.all([
            oldCache && oldCache.disconnect(),
        ]);
    }

    async start() {
        await this.cache.connect();

        const startTestServer = this.conf.enableTestFeatures ? this.testServer.start() : null;
        const startOauthTestServer = this.conf.oauthTestServer.enabled
            ?  this.oauthTestServer.start()
            : null;

        // We only start the control client if we're running within Mojaloop Payment Manager.
        // The control server is the Payment Manager Management API Service.
        // We only start the client to connect to and listen to the Management API service for
        // management protocol messages e.g configuration changes, certificate updates etc.
        if (this.conf.pm4mlEnabled) {
            this.controlClient = await ControlAgent.Client.Create({
                address: this.conf.control.mgmtAPIWsUrl,
                port: this.conf.control.mgmtAPIWsPort,
                logger: this.logger.push(LOG_ID.CONTROL),
                appConfig: this.conf,
            });
            this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this));
        }

        await Promise.all([
            this.inboundServer.start(),
            this.outboundServer.start(),
            this.metricsServer.start(),
            startTestServer,
            startOauthTestServer,
        ]);
    }

    stop() {
        return Promise.all([
            this.inboundServer.stop(),
            this.outboundServer.stop(),
            this.oauthTestServer.stop(),
            this.testServer.stop(),
            this.controlClient.stop(),
            this.metricsServer.stop(),
        ]);
    }
}

/*
* Call the Connector Manager in Management API to get the updated config
*/
async function _GetUpdatedConfigFromMgmtAPI(conf, logger, client) {
    logger.log(`Getting updated config from Management API at ${conf.control.mgmtAPIWsUrl}:${conf.control.mgmtAPIWsPort}...`);
    const clientSendResponse = await client.send(ControlAgent.build.CONFIGURATION.READ());
    logger.log('client send returned:: ', clientSendResponse);
    const responseRead = await client.receive();
    logger.log('client receive returned:: ', responseRead);
    return responseRead.data;
}

if(require.main === module) {
    (async () => {
        // this module is main i.e. we were started as a server;
        // not used in unit test or "require" scenarios
        const logger = new Logger.Logger({
            context: {
                // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
                simulator: process.env['SIM_NAME'],
                hostname: hostname(),
            },
            stringify: Logger.buildStringify({ space: config.logIndent }),
        });
        if(config.pm4mlEnabled) {
            const controlClient = await ControlAgent.Client.Create({
                address: config.control.mgmtAPIWsUrl,
                port: config.control.mgmtAPIWsPort,
                logger: logger,
                appConfig: config,
            });
            const updatedConfigFromMgmtAPI = await _GetUpdatedConfigFromMgmtAPI(config, logger, controlClient);
            logger.log(`updatedConfigFromMgmtAPI: ${JSON.stringify(updatedConfigFromMgmtAPI)}`);
            _.merge(config, updatedConfigFromMgmtAPI);
            controlClient.terminate();
        }
        const svr = new Server(config, logger);
        svr.on('error', (err) => {
            logger.push({ err }).log('Unhandled server error');
            process.exit(1);
        });

        // handle SIGTERM to exit gracefully
        process.on('SIGTERM', async () => {
            logger.log('SIGTERM received. Shutting down APIs...');
            await svr.stop();
            process.exit(0);
        });

        svr.start().catch(err => {
            logger.push({ err }).log('Error starting server');
            process.exit(1);
        });
    })();
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
};
