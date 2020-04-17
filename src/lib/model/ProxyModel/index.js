/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

const { BackendError } = require('../common');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const Ajv = require('ajv');
const configSchema = require('./configSchema');
const util = require('util');
const Route = require('./Route');

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
     * @param config.wso2Auth {Object}
     */
    constructor(config) {
        this._logger = config.logger;

        //Note that we strip off any path on peerEndpoint config after the origin.
        //this is to allow proxy routed requests to hit any path on the peer origin
        //irrespective of any base path on the PEER_ENDPOINT setting

        this._requests = new MojaloopRequests({
            logger: this._logger,
            peerEndpoint: config.peerEndpoint,
            dfspId: config.dfspId,
            tls: config.tls,
            jwsSign: config.jwsSign,
            jwsSigningKey: config.jwsSigningKey,
            wso2Auth: config.wso2Auth
        });

        this._validateConfig(config.proxyConfig);
        this._routes = this._createRoutes(config.proxyConfig);
    }

    async _executePostRequest(request) {
        const res = await this._requests.postCustom(request.url, request.body, request.headers, request.query);
        this._logger.push({ res }).log('POST request sent successfully');
        return res;
    }

    async _executePutRequest(request) {
        const res = await this._requests.putCustom(request.url, request.body, request.headers, request.query);
        this._logger.push({ res }).log('PUT request sent successfully');
        return res;
    }

    async _executeGetRequest(request) {
        const res = await this._requests.getCustom(request.url, request.headers, request.query);
        this._logger.push({ res }).log('GET request sent successfully');
        return res;
    }

    _validateConfig(config) {
        const ajv = new Ajv();
        const validate = ajv.compile(configSchema);
        const valid = validate(config);
        if (!valid) {
            const errors = util.inspect(validate.errors);
            this._logger.push({ errors }).error('Proxy config is invalid');
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
            this._logger.push({ e }).error('Failed to create route');
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
            this._logger.log(`No proxy rule found for ${request.url}`);
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
