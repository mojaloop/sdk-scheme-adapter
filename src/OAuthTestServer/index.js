/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

'use strict';

const Koa = require('koa');
const koaBody = require('koa-body');
const OAuthServer = require('koa2-oauth-server');
const { Logger, Transports } = require('@internal/log');
const { InMemoryCache } = require('./model');

class OAuthTestServer {
    /**
     *
     * @param {Object} conf
     * @param {number} conf.port OAuth server listen port
     * @param {string} conf.clientKey Customer Key
     * @param {String} conf.clientSecret Customer Secret
     * @param {String} conf.logIndent
     * @returns {Promise}
     */
    constructor(conf) {
        this.conf = conf;
        this.api = null;
        this.logger = null;
    }

    async start() {
        await new Promise((resolve) => {
            this.api.listen(this.conf.port, () => {
                this.logger.log(`Serving OAuth2 Test Server on port ${this.conf.port}`);
                return resolve();
            });
        });
    }

    async stop() {
        if (this.api) {
            await new Promise(resolve => {
                this.api.close(() => {
                    console.log('OAuth2 Test Server shut down complete');
                    return resolve();
                });
            });
        }
    }

    async setupApi() {
        this.api = new Koa();
        this.logger = await this._createLogger();

        this.api.oauth = new OAuthServer({
            model: new InMemoryCache(this.conf),
            accessTokenLifetime: 60 * 60,
            allowBearerTokensInQueryString: true,
        });

        this.api.use(koaBody());
        this.api.use(this.api.oauth.token());

        this.api.use(async (next) => {
            this.body = 'Secret area';
            await next();
        });
    }

    async _createLogger() {
        const transports = await Promise.all([Transports.consoleDir()]);
        // Set up a logger for each running server
        return new Logger({
            context: {
                app: 'mojaloop-sdk-oauth-test-server'
            },
            space: this.conf.logIndent,
            transports,
        });
    }
}


module.exports = OAuthTestServer;
