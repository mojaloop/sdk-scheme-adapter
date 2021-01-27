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
const config = require('./config');
const EventEmitter = require('events');

const InboundServer = require('./InboundServer');
const OutboundServer = require('./OutboundServer');
const OAuthTestServer = require('./OAuthTestServer');
const TestServer = require('./TestServer');

// import things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
const InboundServerMiddleware = require('./InboundServer/middlewares.js');
const OutboundServerMiddleware = require('./OutboundServer/middlewares.js');
const Router = require('@internal/router');
const Validate = require('@internal/validate');
const RandomPhrase = require('@internal/randomphrase');
const Cache = require('@internal/cache');
const { Logger } = require('@mojaloop/sdk-standard-components');

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
            logger: this.logger.push({ component: 'cache' }),
            enableTestFeatures: conf.enableTestFeatures,
        });

        this.inboundServer = new InboundServer(
            this.conf,
            this.logger.push({ app: 'mojaloop-sdk-inbound-api' }),
            this.cache
        );
        this.inboundServer.on('error', (...args) => {
            this.logger.push({ args }).log('Unhandled error in Inbound Server');
            this.emit('error', 'Unhandled error in Inbound Server');
        });

        this.outboundServer = new OutboundServer(
            this.conf,
            this.logger.push({ app: 'mojaloop-sdk-outbound-api' }),
            this.cache
        );
        this.outboundServer.on('error', (...args) => {
            this.logger.push({ args }).log('Unhandled error in Outbound Server');
            this.emit('error', 'Unhandled error in Outbound Server');
        });

        this.oauthTestServer = new OAuthTestServer({
            clientKey: this.conf.oauthTestServer.clientKey,
            clientSecret: this.conf.oauthTestServer.clientSecret,
            port: this.conf.oauthTestServer.listenPort,
            logger: this.logger.push({ app: 'mojaloop-sdk-oauth-test-server' }),
        });

        this.testServer = new TestServer({
            port: this.conf.testServerPort,
            logger: this.logger.push({ app: 'mojaloop-sdk-test-api' }),
            cache: this.cache,
        });
    }

    async start() {
        await this.cache.connect();

        const startTestServer = this.conf.enableTestFeatures ? this.testServer.start() : null;
        const startOauthTestServer = this.conf.oauthTestServer.enabled
            ?  this.oauthTestServer.start()
            : null;
        await Promise.all([
            this.inboundServer.start(),
            this.outboundServer.start(),
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
        ]);
    }
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
    InboundServerMiddleware,
    OutboundServerMiddleware,
    RandomPhrase,
    Router,
    Server,
    Validate,
};
