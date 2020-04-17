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
const Log = require('@internal/log');
const Cache = require('@internal/cache');

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
    }

    async start() {
        this.inboundServer = new InboundServer(this.conf);
        this.outboundServer = new OutboundServer(this.conf);
        this.oauthTestServer = new OAuthTestServer({
            clientKey: this.conf.oauthTestServer.clientKey,
            clientSecret: this.conf.oauthTestServer.clientSecret,
            port: this.conf.oauthTestServer.listenPort,
            logIndent: this.conf.logIndent,
        });
        this.testServer = new TestServer(this.conf);

        await Promise.all([
            this._startInboundServer(),
            this._startOutboundServer(),
            this._startOAuthTestServer(),
            this._startTestServer(),
        ]);
    }

    async _startTestServer() {
        await this.testServer.setupApi();
        await this.testServer.start();
    }

    async _startInboundServer() {
        await this.inboundServer.setupApi();
        await this.inboundServer.start();
    }

    async _startOutboundServer() {
        await this.outboundServer.setupApi();
        await this.outboundServer.start();
    }

    async _startOAuthTestServer() {
        if (this.conf.oauthTestServer.enabled) {
            await this.oauthTestServer.setupApi();
            await this.oauthTestServer.start();
        }
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
    Log: Log,
    Cache: Cache
};
