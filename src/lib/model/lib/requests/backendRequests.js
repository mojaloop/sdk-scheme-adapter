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

const http = require('http');
const { request } = require('@mojaloop/sdk-standard-components');
const { buildUrl, throwOrJson, HTTPResponseError } = require('./common');


/**
 * A class for making requests to DFSP backend API
 */
class BackendRequests {
    constructor(config) {
        this.config = config;
        this.logger = config.logger;

        // FSPID of THIS DFSP
        this.dfspId = config.dfspId;

        // make sure we keep alive connections to the backend
        this.agent = new http.Agent({
            keepAlive: true
        });

        this.transportScheme = 'http';

        // Switch or peer DFSP endpoint
        this.backendEndpoint = `${this.transportScheme}://${config.backendEndpoint}`;
    }

    /**
     * Executes a /signchallenge request by passing authorization request details
     *
     * @returns {object} - JSON response body if one was received
     */
    async getSignedChallenge(authorizationReq) {
        return this._post('signchallenge', authorizationReq);
    }

    async validateAuthorization(authorizationResponse) {
        return this._post('validate-authorization', authorizationResponse);
    }

    /**
     * Executes a GET /otp request for the specified transaction request id
     *
     * @returns {object} - JSON response body if one was received
     */
    async getOTP(transactionRequestId) {
        const url = `otp/${transactionRequestId}`;
        return this._get(url);
    }


    /**
     * Executes a GET /parties request for the specified identifier type and identifier
     *
     * @returns {object} - JSON response body if one was received
     */
    async getParties(idType, idValue, idSubValue) {
        const url = `parties/${idType}/${idValue}`
          + (idSubValue ? `/${idSubValue}` : '');
        return this._get(url);
    }

    /**
     * Executes a GET /transfers request for the specified transfer ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getTransfers(transferId) {
        const url = `transfers/${transferId}`;
        return this._get(url);
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
     * Executes a POST /transactionRequests request for the specified transaction request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postTransactionRequests(transactionRequest) {
        return this._post('transactionrequests', transactionRequest);
    }

    /**
     * Executes a POST /bulkQuotes request for the specified bulk quotes request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postBulkQuotes(bulkQuotesRequest) {
        return this._post('bulkQuotes', bulkQuotesRequest);
    }

    /**
     * Executes a GET /bulkQuotes/{ID} request for the specified bulk quote ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getBulkQuotes(bulkQuoteId) {
        const url = `bulkQuotes/${bulkQuoteId}`;
        return this._get(url);
    }

    /**
     * Executes a POST /bulkTransfers request for the specified bulk transfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postBulkTransfers(prepare) {
        return this._post('bulkTransfers', prepare);
    }

    /**
     * Executes a GET /bulkTransfers/{ID} request for the specified bulk transfer ID
     *
     * @returns {object} - JSON response body if one was received
     */
    async getBulkTransfers(bulkTransferId) {
        const url = `bulkTransfers/${bulkTransferId}`;
        return this._get(url);
    }

    /**
     * Executes a PUT /transfers/{ID} request to forward notification for success
     *
     * @returns {object} - JSON response body if one was received
     */

    async putTransfersNotification(notifcation, transferId) {
        const url = `transfers/${transferId}`;
        return this._put(url, notifcation);
    }

    /**
     * Utility function for building outgoing request headers as required by the mojaloop api spec
     *
     * @returns {object} - headers object for use in requests to mojaloop api endpoints
     */
    _buildHeaders () {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Date': new Date().toUTCString()
        };

        return headers;
    }

    _get(url) {
        const reqOpts = {
            method: 'GET',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
        };

        // Note we do not JWS sign requests with no body i.e. GET requests

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP GET');
            return request({...reqOpts, agent: this.agent}).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ e }).log('Error attempting HTTP GET');
            throw e;
        }
    }


    _put(url, body) {
        const reqOpts = {
            method: 'PUT',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP PUT');
            return request({...reqOpts, agent: this.agent}).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ e }).log('Error attempting HTTP PUT');
            throw e;
        }
    }


    _post(url, body) {
        const reqOpts = {
            method: 'POST',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body),
        };

        try {
            this.logger.push({ reqOpts }).log('Executing HTTP POST');
            return request({...reqOpts, agent: this.agent}).then(throwOrJson);
        }
        catch (e) {
            this.logger.push({ e }).log('Error attempting POST.');
            throw e;
        }
    }
}


module.exports = {
    BackendRequests,
    HTTPResponseError,
};
