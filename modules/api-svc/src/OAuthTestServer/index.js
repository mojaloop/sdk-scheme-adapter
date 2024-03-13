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

const express = require('express');
const bodyParser = require('body-parser');
const OAuth2Server = require('oauth2-server');
const { InMemoryCache } = require('./model');
const {Request, Response} = require('oauth2-server');
const UnauthorizedRequestError = require('oauth2-server/lib/errors/unauthorized-request-error');

class OAuthTestServer {
    /**
     *
     * @param {Object} conf
     * @param {number} conf.port OAuth server listen port
     * @param {string} conf.clientKey Customer Key
     * @param {String} conf.clientSecret Customer Secret
     * @param {Logger} conf.logger Logger
     */
    constructor({ port, clientKey, clientSecret, logger }) {
        this._port = port;
        this._logger = logger;
        this._clientKey = clientKey;
        this._clientSecret = clientSecret;
    }

    async start() {
        if (this._app) {
            return;
        }
        this._app = express();

        this._oauth = new OAuth2Server({
            model: new InMemoryCache({ clientKey: this._clientKey, clientSecret:this._clientSecret }),
            accessTokenLifetime: 60 * 60,
            allowBearerTokensInQueryString: true,
        });

        this._app.use(bodyParser.urlencoded({ extended: false }));
        this._app.use(bodyParser.json());
        this._app.use(this.tokenMiddleware());


        await new Promise((resolve) => this._app.listen(this._port, resolve));
        this._logger.isInfoEnabled && this._logger.push({ port: this._port }).info('Serving OAuth2 Test Server');
    }

    async stop() {
        if (!this._app) {
            return;
        }
        await new Promise(resolve => this._app.close(resolve));
        this._app = null;
        this._logger.isInfoEnabled && this._logger.info('OAuth2 Test Server shut down complete');
    }

    handleResponse(req, res, response) {
        if (response.status === 302) {
            const location = response.headers.location;
            delete response.headers.location;
            res.set(response.headers);
            res.redirect(location);
        } else {
            res.set(response.headers);
            res.status(response.status).send(response.body);
        }
    }

    handleError(e, req, res, response) {
        if (response) {
            res.set(response.headers);
        }

        res.status(e.code);

        if (e instanceof UnauthorizedRequestError) {
            return res.send();
        }

        res.send({ error: e.name, error_description: e.message });
    }

    tokenMiddleware(options) {
        return async (req, res, next) => {
            const request = new Request(req);
            const response = new Response(res);

            let token;

            try {
                token = await this._oauth.token(request, response, options);
                res.locals.oauth = {token};
            } catch (e) {
                await this.handleError(e, req, res, response, next);
                return;
            }

            await this.handleResponse(req, res, response);

        };
    }
}


module.exports = OAuthTestServer;
