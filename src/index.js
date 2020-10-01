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
class Server {
    constructor(conf) {
        this.conf = conf;
        this.inboundServer = null;
        this.outboundServer = null;
        this.oauthTestServer = null;
        this.testServer = null;
        this.logger = new Logger.Logger({
            context: {
                // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
                simulator: process.env['SIM_NAME'],
                hostname: hostname(),
            }
        });
        this.cache = new Cache({
            ...conf.cacheConfig,
            logger: this.logger.push({ component: 'cache' })
        });
    }

    async start() {
        this.inboundServer = new InboundServer(
            this.conf,
            this.logger.push({ app: 'mojaloop-sdk-inbound-api' }),
            this.cache
        );

        this.outboundServer = new OutboundServer(
            this.conf,
            this.logger.push({ app: 'mojaloop-sdk-outbound-api' }),
            this.cache
        );

        this.oauthTestServer = new OAuthTestServer({
            clientKey: this.conf.oauthTestServer.clientKey,
            clientSecret: this.conf.oauthTestServer.clientSecret,
            port: this.conf.oauthTestServer.listenPort,
            logger: this.logger.push({ app: 'mojaloop-sdk-oauth-test-server' }),
        });

        this.testServer = new TestServer({
            port: this.conf.test.port,
            tls: this.conf.test.tls,
            logger: this.logger.push({ app: 'mojaloop-sdk-test-api' }),
            cache: this.cache,
        });

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
        const svr = new Server(config);

        // handle SIGTERM to exit gracefully
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received. Shutting down APIs...');

            await svr.stop();
            process.exit(0);
        });

        svr.start().catch(err => {
            console.log(err);
            process.exit(1);
        });
    })();
}


// export things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
module.exports = {
    Server: Server,
    InboundServerMiddleware: InboundServerMiddleware,
    OutboundServerMiddleware: OutboundServerMiddleware,
    Router: Router,
    Validate: Validate,
    RandomPhrase: RandomPhrase,
    Cache: Cache
};
