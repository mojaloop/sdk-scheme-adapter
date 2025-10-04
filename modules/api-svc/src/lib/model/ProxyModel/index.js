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
const { BackendError } = require('../common');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const Ajv = require('ajv');
const configSchema = require('./configSchema');
const Route = require('./Route');
const safeStringify = require('fast-safe-stringify');

/**
 * ProxyModel forwards request to corresponding endpoint based on provided route config
 */
class ProxyModel {
    /**
     *
     * @param config
     * @param config.logger {Object}
     * @param config.proxyConfig {Object}
     * @param config.peerEndpoint {string}
     * @param config.dfspId {string}
     * @param config.tls {Object}
     * @param config.oidc {Object}
     */
    constructor(config) {
        this._logger = config.logger;

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            tls: {
                enabled: config.outbound.tls.mutualTLS.enabled,
                creds: config.outbound.tls.creds,
            },
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            oidc: config.oidc
        });

        this._validateConfig(config.proxyConfig);
        this._routes = this._createRoutes(config.proxyConfig);
    }

    async _executePostRequest(request) {
        const res = await this._requests.postCustom(request.url, request.body, request.headers, request.query, true);
        await this._logger.push({statusCode: res.statusCode, headers: res.headers}).debug('POST request sent successfully');
        return res;
    }

    async _executePutRequest(request) {
        const res = await this._requests.putCustom(request.url, request.body, request.headers, request.query, true);
        await this._logger.push({statusCode: res.statusCode, headers: res.headers}).debug('PUT request sent successfully');
        return res;
    }

    async _executeGetRequest(request) {
        const res = await this._requests.getCustom(request.url, request.headers, request.query, true);
        await this._logger.push({statusCode: res.statusCode, headers: res.headers}).debug('GET request sent successfully');
        return res;
    }

    _validateConfig(config) {
        const ajv = new Ajv();
        const validate = ajv.compile(configSchema);
        const valid = validate(config);
        if (!valid) {
            const errors = safeStringify(validate.errors);
            this._logger.isErrorEnabled && this._logger.push({ errors }).error('Proxy config is invalid');
            throw new Error(`Proxy config is invalid: ${errors}`);
        }
    }

    /**
     *
     * @param config
     * @returns {Array.<Object>} myObjects
     * @private
     */
    _createRoutes(config) {
        try {
            return config.routes.map(routeConfig => new Route(routeConfig));
        } catch (e) {
            this._logger.isErrorEnabled && this._logger.push({ e }).error('Failed to create route');
            throw e;
        }
    }

    _getMatchingDestination(request) {
        for (const route of this._routes) {
            // Destructure request object to show what we are expecting
            const {path, query, headers} = request;
            if (route.matchRequest({path, query, headers})) {
                return route.destination;
            }
        }
    }

    /**
     * Perform request forwarding
     * @param request {object}
     * @param request.method {string}
     * @param request.url {string}
     * @param request.body {object}
     * @param request.headers {object}
     * @return {Promise<object>}
     */
    async proxyRequest(request) {
        const allowedMethods = ['GET', 'POST', 'PUT'];
        const method = request.method.toUpperCase();
        if (!allowedMethods.includes(method)) {
            throw new BackendError(`Unsupported HTTP method "${request.method}"`, 400);
        }
        const url = this._getMatchingDestination(request);
        if (!url) {
            this._logger.isDebugEnabled && this._logger.debug(`No proxy rule found for ${request.url}`);
            return;
        }
        const destReq = {
            url,
            body: request.body,
            headers: request.headers,
            query: request.query,
        };
        switch (method) {
            case 'GET': return this._executeGetRequest(destReq);
            case 'POST': return this._executePostRequest(destReq);
            case 'PUT': return this._executePutRequest(destReq);
        }
    }
}


module.exports = ProxyModel;
