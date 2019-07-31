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

const request = require('request-promise-native');

const http = require('http');

const common = require('./common.js');
const buildUrl = common.buildUrl;
const throwOrJson = common.throwOrJson;


/**
 * A class for making requests to DFSP backend API
 */
class BackendRequests {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;

        // FSPID of THIS DFSP
        this.dfspId = config.dfspId;

        this.agent = http.globalAgent;
        this.transportScheme = 'http';

        // Switch or peer DFSP endpoint
        this.backendEndpoint = `${this.transportScheme}://${config.backendEndpoint}`;
    }


    /**
     * Executes a GET /parties request for the specified identifier type and identifier 
     *
     * @returns {object} - JSON response body if one was received
     */
    async getParties(idType, idValue) {
        return this._get(`parties/${idType}/${idValue}`, 'parties');
    }


    /**
     * Executes a POST /quotes request for the specified quote request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postQuoteRequests(quoteRequest) {
        return this._post('quoterequests', quoteRequest);
    }


    /**
     * Executes a POST /transfers request for the specified transfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postTransfers(prepare) {
        return this._post('transfers', prepare);
    }


    /**
     * Utility function for building outgoing request headers as required by the mojaloop api spec
     *
     * @returns {object} - headers object for use in requests to mojaloop api endpoints
     */
    _buildHeaders () {
        let headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Date': new Date().toUTCString()
        };

        return headers;
    }

    async _get(url) {
        const reqOpts = {
            method: 'GET',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            agent: this.agent,
            resolveWithFullResponse: true,
            simple: false
        };

        // Note we do not JWS sign requests with no body i.e. GET requests

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP GET');
            return await request(reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ url, reqOpts, e }).log('Error attempting HTTP GET');
            throw e;
        }
    }


    async _put(url, body) {
        const reqOpts = {
            method: 'PUT',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body),
            resolveWithFullResponse: true,
            simple: false,
        };

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP PUT');
            return await request(reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ url, reqOpts, e }).log('Error attempting HTTP PUT');
            throw e;
        }
    }


    async _post(url, body) {
        const reqOpts = {
            method: 'POST',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body),
            resolveWithFullResponse: true,
            simple: false,
        };

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP POST');
            return await request(reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ url, reqOpts, e }).log('Error attempting POST.');
            throw e;
        }
    }
}


module.exports = {
    BackendRequests: BackendRequests,
    HTTPResponseError: common.HTTPResponseError
};
