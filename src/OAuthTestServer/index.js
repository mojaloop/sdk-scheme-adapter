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
const { InMemoryCache } = require('./model');

class OAuthTestServer {
    /**
     *
     * @param {Object} conf
     * @param {number} conf.port OAuth server listen port
     * @param {string} conf.clientKey Customer Key
     * @param {String} conf.clientSecret Customer Secret
     */
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._logger = conf.logger;
        this._setupApi();
    }

    async start() {
        await new Promise((resolve) => this._api.listen(this._conf.port, resolve));
        this._logger.log(`Serving OAuth2 Test Server on port ${this._conf.port}`);
    }

    async stop() {
        if (this._api) {
            return;
        }
        await new Promise(resolve => this._api.close(resolve));
        console.log('OAuth2 Test Server shut down complete');
    }

    async _setupApi() {
        this._api = new Koa();

        this._api.oauth = new OAuthServer({
            model: new InMemoryCache(this._conf),
            accessTokenLifetime: 60 * 60,
            allowBearerTokensInQueryString: true,
        });

        this._api.use(koaBody());
        this._api.use(this._api.oauth.token());

        this._api.use(async (next) => {
            this.body = 'Secret area';
            await next();
        });
    }
}


module.exports = OAuthTestServer;
