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

const { setConfig, getConfig } = require('./config.js');

const InboundServer = require('./InboundServer');
const OutboundServer = require('./OutboundServer');
const OAuthTestServer = require('./OAuthTestServer');

class Server {
    constructor(conf) {
        this.conf = conf;
        this.inboundServer = null;
        this.outboundServer = null;
        this.oauthTestServer = null;
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

        await Promise.all([
            this._startInboundServer(),
            this._startOutboundServer(),
            this._startOAuthTestServer(),
        ]);
    }

    async _startInboundServer() {
        await this.inboundServer.setupApi();
        await this.inboundServer.start();
        this.inboundServer.initializeInstrumentation();
    }

    async _startOutboundServer() {
        await this.outboundServer.setupApi();
        await this.outboundServer.start();
        this.outboundServer.initializeInstrumentation();
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
        ]);
    }
}


if(require.main === module) {
    (async () => {
        // we were started direct, not required as in unit test scenario
        await setConfig(process.env);
        const conf = getConfig();

        const svr = new Server(conf);

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


// export things we want to unit test
module.exports = {
    Server: Server
};
