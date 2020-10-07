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

const http = require('http');
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
     * @param {Logger} conf.logger Logger
     */
    constructor(conf) {
        this._conf = conf;
        this._api = null;
        this._logger = conf.logger;
        this._api = this._SetupApi();
        this._server = http.createServer(this._api.callback());
    }

    async start() {
        if (this._server.listening) {
            return;
        }
        await new Promise((resolve) => this._server.listen(this._conf.port, resolve));
        this._logger.push({ port: this._conf.port }).log('Serving OAuth2 Test Server');
    }

    async stop() {
        await new Promise(resolve => this._server.close(resolve));
        this._logger.log('OAuth2 Test Server shut down complete');
    }

    static _SetupApi({ clientKey, clientSecret }) {
        const result = new Koa();

        result.oauth = new OAuthServer({
            model: new InMemoryCache({ clientKey, clientSecret }),
            accessTokenLifetime: 60 * 60,
            allowBearerTokensInQueryString: true,
        });

        result.use(koaBody());
        result.use(result.oauth.token());
    }
}


module.exports = OAuthTestServer;
