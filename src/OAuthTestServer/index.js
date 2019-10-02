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

const koa = require('koa');
const koaBody = require('koa-body');
const OAuthServer = require('koa2-oauth-server');
const { Logger, Transports } = require('@internal/log');
const { InMemoryCache } = require('./model');

const LOG_NAME = 'mojaloop-sdk-oauth-test-server';

/**
 *
 * @param {Object} opts
 * @param {number} opts.port OAuth server listen port
 * @param {string} opts.clientKey Customer Key
 * @param {String} opts.clientSecret Customer Secret
 * @returns {Promise}
 */
module.exports = (opts) => {
    const space = Number(process.env.LOG_INDENT);
    const logger = new Logger({ context: { app: LOG_NAME }, space, transports: [Transports.consoleDir()] });

    const app = new koa();

    app.oauth = new OAuthServer({
        model: new InMemoryCache(opts),
        accessTokenLifetime: 60 * 60,
        allowBearerTokensInQueryString: true,
    });

    app.use(koaBody());
    app.use(app.oauth.token());

    app.use(async (next) => {
        this.body = 'Secret area';
        await next();
    });

    app.listen(opts.port);
    logger.log(`Serving OAuth2 Test Server on port ${opts.port}`);
    return new Promise((resolve, reject) => {
        app.on('error', err => {
            logger.error(err);
            reject(err);
        });
        app.on('close', () => resolve());
    });
};
