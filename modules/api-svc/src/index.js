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
'use strict';

const EventEmitter = require('node:events');
const http = require('http');
const https = require('https');
const _ = require('lodash');
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
const { logger } = require('./lib/logger');

const PING_INTERVAL_MS = 30000;

const createCache = (config) => new Cache({
    logger,
    cacheUrl: config.cacheUrl,
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
        this.cache = createCache(conf);

        this.metricsClient = new MetricsClient();
        this.metricsServer = new MetricsServer({
            port: this.conf.metrics.port,
            logger: this.logger
        });

        // Create shared Mojaloop agents for switch communication (used by both servers)
        this.mojaloopSharedAgents = this._createMojaloopSharedAgents(this.conf);

        this.oidc = createAuthClient(conf, logger);
        this.oidc.auth.on('error', (msg) => {
            this.emit('error', 'OIDC auth error in InboundApi', msg);
        });

        this.inboundServer = new InboundServer(
            this.conf,
            this.logger,
            this.cache,
            this.oidc,
            this.mojaloopSharedAgents,
        );
        this.inboundServer.on('error', (...args) => {
            this.logger.isErrorEnabled && this.logger.push({ args }).error('Unhandled error in Inbound Server');
            this.emit('error', 'Unhandled error in Inbound Server');
        });

        this.outboundServer = new OutboundServer(
            this.conf,
            this.logger,
            this.cache,
            this.metricsClient,
            this.oidc,
            this.mojaloopSharedAgents,
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
                logger: this.logger,
            });
        }

        if (this.conf.enableTestFeatures) {
            this.testServer = new TestServer({
                config: this.conf,
                port: this.conf.test.port,
                logger: this.logger,
                cache: this.cache,
            });
        }

        if (this.conf.backendEventHandler.enabled) {
            this.backendEventHandler = new BackendEventHandler({
                config: this.conf,
                logger: this.logger,
            });
        }

        if (this.conf.fspiopEventHandler.enabled) {
            this.fspiopEventHandler = new FSPIOPEventHandler({
                config: this.conf,
                logger: this.logger,
                cache: this.cache,
                oidc: this.oidc,
            });
        }
    }

    _shouldUpdateInboundServer(newConf) {
        const isInboundDifferent = !_.isEqual(this.conf.inbound, newConf.inbound);
        const isOutboundDifferent = !_.isEqual(this.conf.outbound, newConf.outbound);
        const isPeerJWSKeysDifferent = !_.isEqual(this.conf.peerJWSKeys, newConf.peerJWSKeys);
        const isJwsSigningKeyDifferent = !_.isEqual(this.conf.jwsSigningKey, newConf.jwsSigningKey);

        if (isInboundDifferent) {
            this.logger.debug('Inbound config is different', {
                oldInbound: this.conf.inbound,
                newInbound: newConf.inbound
            });
        }
        if (isOutboundDifferent) {
            this.logger.debug('Outbound config is different (checked in inbound update)', {
                oldOutbound: this.conf.outbound,
                newOutbound: newConf.outbound
            });
        }

        if (isPeerJWSKeysDifferent) {
            this.logger.debug('Peer JWS Keys config is different', {
                oldPeerJWSKeys: this.conf.peerJWSKeys,
                newPeerJWSKeys: newConf.peerJWSKeys
            });
        }

        if (isJwsSigningKeyDifferent) {
            this.logger.debug('JWS Signing Key config is different', {
                oldJwsSigningKey: this.conf.jwsSigningKey,
                newJwsSigningKey: newConf.jwsSigningKey
            });
        }

        return isInboundDifferent || isOutboundDifferent || isPeerJWSKeysDifferent || isJwsSigningKeyDifferent;
    }

    _shouldUpdateOutboundServer(newConf) {
        const isOutboundDifferent = !_.isEqual(this.conf.outbound, newConf.outbound);
        const isJwsSigningKeyDifferent = !_.isEqual(this.conf.jwsSigningKey, newConf.jwsSigningKey);

        if (isOutboundDifferent) {
            this.logger.debug('Outbound config is different', {
                oldOutbound: this.conf.outbound,
                newOutbound: newConf.outbound
            });
        }

        if (isJwsSigningKeyDifferent) {
            this.logger.debug('JWS Signing Key config is different', {
                oldJwsSigningKey: this.conf.jwsSigningKey,
                newJwsSigningKey: newConf.jwsSigningKey
            });
        }

        return isOutboundDifferent || isJwsSigningKeyDifferent;
    }

    async start() {
        await this.cache.connect();
        await this.oidc.auth.start();

        // We only start the control client if we're running within Mojaloop Payment Manager.
        // The control server is the Payment Manager Management API Service.
        // We only start the client to connect to and listen to the Management API service for
        // management protocol messages e.g configuration changes, certificate updates etc.
        if (this.conf.pm4mlEnabled) {
            const RESTART_INTERVAL_MS = 10000;
            this.controlClient = await ControlAgent.Client.Create({
                address: this.conf.control.mgmtAPIWsUrl,
                port: this.conf.control.mgmtAPIWsPort,
                logger: this.logger,
                appConfig: this.conf,
            });
            this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this));

            const schedulePing = () => {
                clearTimeout(this.pingTimeout);
                this.pingTimeout = setTimeout(() => {
                    this.logger.error('Ping timeout, possible broken connection. Restarting server...');
                    this.restart(_.merge({}, this.conf, {
                        control: { stopped: Date.now() }
                    }));
                }, PING_INTERVAL_MS + this.conf.control.mgmtAPILatencyAssumption);
            };

            this.controlClient.on('ping', () => {
                this.logger.debug('Received ping from control server');
                schedulePing();
            });

            this.controlClient.on('close', () => {
                clearTimeout(this.pingTimeout);
                setTimeout(() => {
                    this.logger.debug('Control client closed. Restarting server...');
                    this.restart(_.merge({}, this.conf, {
                        control: { stopped: Date.now() }
                    }));
                }, RESTART_INTERVAL_MS);
            });

            schedulePing();
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
        const restartActionsTaken = {};
        this.logger.isDebugEnabled && this.logger.debug('Server is restarting...');

        let oldCache;
        const updateCache = !_.isEqual(this.conf.cacheUrl, newConf.cacheUrl)
            || !_.isEqual(this.conf.enableTestFeatures, newConf.enableTestFeatures);
        if (updateCache) {
            oldCache = this.cache;
            await this.cache.disconnect();
            this.cache = createCache(newConf);
            await this.cache.connect();
            restartActionsTaken.updateCache = true;
        }

        const updateOIDC = !_.isEqual(this.conf.oidc, newConf.oidc)
            || !_.isEqual(this.conf.outbound.tls, newConf.outbound.tls);
        if (updateOIDC) {
            this.oidc.auth.stop();
            this.oidc = createAuthClient(newConf, this.logger);
            this.oidc.auth.on('error', (msg) => {
                this.emit('error', 'OIDC auth error in InboundApi', msg);
            });
            await this.oidc.auth.start();
            restartActionsTaken.updateOIDC = true;
        }

        this.logger.isDebugEnabled && this.logger.push({ oldConf: this.conf.inbound, newConf: newConf.inbound }).debug('Inbound server configuration');
        const updateInboundServer = this._shouldUpdateInboundServer(newConf);
        if (updateInboundServer) {
            const stopStartLabel = 'InboundServer stop/start duration';
            // eslint-disable-next-line no-console
            console.time(stopStartLabel);
            await this.inboundServer.stop();

            this.mojaloopSharedAgents = this._createMojaloopSharedAgents(newConf);
            this.inboundServer = new InboundServer(
                newConf,
                this.logger,
                this.cache,
                this.oidc,
                this.mojaloopSharedAgents,
            );
            this.inboundServer.on('error', (...args) => {
                const errMessage = 'Unhandled error in Inbound Server';
                this.logger.push({ args }).error(errMessage);
                this.emit('error', errMessage);
            });
            await this.inboundServer.start();
            // eslint-disable-next-line no-console
            console.timeEnd(stopStartLabel);
            restartActionsTaken.updateInboundServer = true;
        }

        this.logger.isDebugEnabled && this.logger.push({ oldConf: this.conf.outbound, newConf: newConf.outbound }).debug('Outbound server configuration');
        const updateOutboundServer = this._shouldUpdateOutboundServer(newConf);
        if (updateOutboundServer) {
            const stopStartLabel = 'OutboundServer stop/start duration';
            // eslint-disable-next-line no-console
            console.time(stopStartLabel);
            await this.outboundServer.stop();

            this.mojaloopSharedAgents = this._createMojaloopSharedAgents(newConf);
            this.outboundServer = new OutboundServer(
                newConf,
                this.logger,
                this.cache,
                this.metricsClient,
                this.oidc,
                this.mojaloopSharedAgents,
            );
            this.outboundServer.on('error', (...args) => {
                const errMessage = 'Unhandled error in Outbound Server';
                this.logger.push({ args }).error(errMessage);
                this.emit('error', errMessage);
            });
            await this.outboundServer.start();
            // eslint-disable-next-line no-console
            console.timeEnd(stopStartLabel);
            restartActionsTaken.updateOutboundServer = true;
        }

        const updateFspiopEventHandler = !_.isEqual(this.conf.outbound, newConf.outbound)
            && this.conf.fspiopEventHandler.enabled;
        if (updateFspiopEventHandler) {
            await this.fspiopEventHandler.stop();
            this.fspiopEventHandler = new FSPIOPEventHandler({
                config: newConf,
                logger: this.logger,
                cache: this.cache,
                oidc: this.oidc,
            });
            await this.fspiopEventHandler.start();
            restartActionsTaken.updateFspiopEventHandler = true;
        }

        const updateControlClient = !_.isEqual(this.conf.control, newConf.control);
        if (updateControlClient) {
            await this.controlClient?.stop();
            if (this.conf.pm4mlEnabled) {
                const RESTART_INTERVAL_MS = 10000;

                const schedulePing = () => {
                    clearTimeout(this.pingTimeout);
                    this.pingTimeout = setTimeout(() => {
                        this.logger.error('Ping timeout, possible broken connection. Restarting server...');
                        this.restart(_.merge({}, newConf, {
                            control: { stopped: Date.now() }
                        }));
                    }, PING_INTERVAL_MS + this.conf.control.mgmtAPILatencyAssumption);
                };

                schedulePing();

                this.controlClient = await ControlAgent.Client.Create({
                    address: newConf.control.mgmtAPIWsUrl,
                    port: newConf.control.mgmtAPIWsPort,
                    logger: this.logger,
                    appConfig: newConf,
                });
                this.controlClient.on(ControlAgent.EVENT.RECONFIGURE, this.restart.bind(this));



                this.controlClient.on('ping', () => {
                    this.logger.debug('Received ping from control server');
                    schedulePing();
                });

                this.controlClient.on('close', () => {
                    clearTimeout(this.pingTimeout);
                    setTimeout(() => {
                        this.logger.debug('Control client closed. Restarting server...');
                        this.restart(_.merge({}, newConf, {
                            control: { stopped: Date.now() }
                        }));
                    }, RESTART_INTERVAL_MS);
                });

                restartActionsTaken.updateControlClient = true;
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
                    logger: this.logger,
                });
                await this.oauthTestServer.start();
                restartActionsTaken.updateOAuthTestServer = true;
            }
        }

        const updateTestServer = !_.isEqual(newConf.test.port, this.conf.test.port);
        if (updateTestServer) {
            await this.testServer?.stop();
            if (this.conf.enableTestFeatures) {
                this.testServer = new TestServer({
                    port: newConf.test.port,
                    logger: this.logger,
                    cache: this.cache,
                });
                await this.testServer.start();
                restartActionsTaken.updateTestServer = true;
            }
        }

        this.conf = newConf;

        await oldCache?.disconnect();

        if (Object.keys(restartActionsTaken).length > 0) {
            this.logger.info('Server is restarted', { restartActionsTaken });
        } else {
            this.logger.verbose('Server not restarted, no config changes detected');
        }
    }

    stop() {
        clearTimeout(this.pingTimeout);
        this.oidc.auth.stop();
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

    _createMojaloopSharedAgents(conf) {
        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: conf.outbound?.maxSockets || 256,
        });

        // Create HTTPS agent based on TLS configuration for Mojaloop switch communication
        const httpsAgentOptions = {
            keepAlive: true,
            maxSockets: conf.outbound?.maxSockets || 256,
        };

        // Apply TLS configuration if mTLS is enabled for switch communication
        if (conf.outbound?.tls?.mutualTLS?.enabled && conf.outbound?.tls?.creds) {
            Object.assign(httpsAgentOptions, conf.outbound.tls.creds);
        }

        const httpsAgent = new https.Agent(httpsAgentOptions);

        // Prevent accidental logging of agent internals
        httpAgent.toJSON = () => ({ type: 'HttpAgent', keepAlive: httpAgent.keepAlive });
        httpsAgent.toJSON = () => ({ type: 'HttpsAgent', keepAlive: httpsAgent.keepAlive });

        this.logger.isInfoEnabled && this.logger.info('Created shared HTTP and HTTPS agents for Mojaloop switch communication');

        return {
            httpAgent,
            httpsAgent
        };
    }
}

/*
* Call the Connector Manager in Management API to get the updated config
*/
async function _GetUpdatedConfigFromMgmtAPI(conf, logger, client) {
    logger.isInfoEnabled && logger.info(`Getting updated config from Management API at ${conf.control.mgmtAPIWsUrl}:${conf.control.mgmtAPIWsPort}...`);
    const clientSendResponse = await client.send(ControlAgent.build.CONFIGURATION.READ());
    logger.isDebugEnabled && logger.debug('client send returned:: ', clientSendResponse);
    const responseRead = await client.receive();
    logger.isDebugEnabled && logger.debug('client receive returned:: ', responseRead);
    return responseRead.data;
}

async function start(config) {
    if (config.pm4mlEnabled) {
        const controlClient = await ControlAgent.Client.Create({
            appConfig: config,
            address: config.control.mgmtAPIWsUrl,
            port: config.control.mgmtAPIWsPort,
            logger,
        });
        const updatedConfigFromMgmtAPI = await _GetUpdatedConfigFromMgmtAPI(config, logger, controlClient);
        logger.isInfoEnabled && logger.push({ updatedConfigFromMgmtAPIKeys: Object.keys(updatedConfigFromMgmtAPI) }).info('updatedConfigFromMgmtAPI keys:');
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
        logger.info('SIGTERM received. Shutting down SDK...');
        await svr.stop();
        process.exit(0);
    });

    await svr.start().catch(err => {
        logger.push({ err }).error('Error starting server');
        process.exit(1);
    });

    logger.info('SDK server is started!', { name, version });
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
