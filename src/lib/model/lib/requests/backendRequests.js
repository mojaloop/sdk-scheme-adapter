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

const fetch = require('node-fetch');
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
            'Date': new Date().toUTCString(),
            // yuck! node-fetch INSISTS on sending a user-agent header!? infuriating! would be
            // better to not send this header to not leak info
            'User-Agent': 'Mojaloop SDK'  
        };

        return headers;
    }


    async _get(url) {
        const reqOpts = {
            method: 'GET',
            headers: this._buildHeaders(),
            agent: this.agent
        };

        try {
            return await fetch(buildUrl(this.backendEndpoint, url), reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.log('Error attempting GET. URL:', url, 'Opts:', reqOpts, 'Error:', e);
            throw e;
        }
    }


    async _put(url, body) {
        const reqOpts = {
            method: 'PUT',
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };

        try {
            return await fetch(buildUrl(this.backendEndpoint, url), reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.log('Error attempting PUT. URL:', url, 'Opts:', reqOpts, 'Body:', body, 'Error:', e);
            throw e;
        }
    }


    async _post(url, body) {
        const reqOpts = {
            method: 'POST',
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };

        try {
            return await fetch(buildUrl(this.backendEndpoint, url), reqOpts).then(throwOrJson);
        }
        catch (e) {
            this.logger.log('Error attempting POST. URL:', url, 'Opts:', reqOpts, 'Body:', body, 'Error:', e);
            throw e;
        }
    }
}



module.exports = BackendRequests;
