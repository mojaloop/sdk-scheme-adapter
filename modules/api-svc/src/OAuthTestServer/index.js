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
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Yevhen Kyriukha - <yevhen.kyriukha@modusbox.com>

 --------------
 ******/
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
        this._logger = logger.push({ component: this.constructor.name });
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
