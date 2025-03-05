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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const http = require('node:http');
const { createHttpRequester } = require('@mojaloop/sdk-standard-components').httpRequester;
const { buildUrl, HTTPResponseError } = require('./common');


/**
 * A class for making requests to DFSP backend API
 */
class BackendRequests {
    constructor(config) {
        this.config = config;
        this.logger = config.logger.push({ component: BackendRequests.name });
        this.requester = createHttpRequester({ logger: this.logger });

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
     * Executes a POST /fxQuotes request for the specified fxQuotes request
     *
     * @returns {object} - JSON response body if one was received
     */
    async postFxQuotes(payload) {
        return this._post('fxQuotes', payload);
    }

    /**
     * Executes a POST /fxTransfers request for the specified fxTransfer prepare
     *
     * @returns {object} - JSON response body if one was received
     */
    async postFxTransfers(payload) {
        return this._post('fxTransfers', payload);
    }

    async patchFxTransfersNotification(notification, conversionId) {
        const url = `fxTransfers/${conversionId}`;
        return this._patch(url, notification);
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
     * Executes a PUT /requestToPay/{ID} request to forward notification for success
     *
     * @returns {object} - JSON response body if one was received
     */

    async putRequestToPayNotification(notifcation, transactionRequestId) {
        const url = `requestToPay/${transactionRequestId}`;
        return this._put(url, notifcation);
    }

    /**
     * Executes a PUT /bulkTransactions/{ID} request
     *
     * @returns {object} - JSON response body if one was received
     */

    async putBulkTransactions(transactionId, body) {
        const url = `bulkTransactions/${transactionId}`;
        return this._put(url, body);
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
        return this.sendRequest(reqOpts);
    }


    _put(url, body) {
        const reqOpts = {
            method: 'PUT',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts);
    }


    _post(url, body) {
        const reqOpts = {
            method: 'POST',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body),
        };
        return this.sendRequest(reqOpts);
    }

    _patch(url, body) {
        const reqOpts = {
            method: 'PATCH',
            uri : buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts);
    }

    async sendRequest(reqOptions) {
        try {
            this.logger.isVerboseEnabled && this.logger.push({ reqOptions }).verbose(`Executing HTTP ${reqOptions?.method}...`);
            const res = await this.requester.sendRequest({ ...reqOptions, agent: this.agent });

            const data = (res.headers['content-length'] === '0' || res.statusCode === 204)
                ? null
                : res.data;
            this.logger.isVerboseEnabled && this.logger.push({ data }).verbose('Received HTTP response data');
            return data;
        } catch (err) {
            this.logger.push({ err }).error(`Error attempting ${reqOptions?.method} ${reqOptions?.uri}`);
            const { data, headers, status } = err.response || err;
            throw new HTTPResponseError({
                res: { data, headers, status },
                msg: err?.message
            });
        }
    }
}


module.exports = {
    BackendRequests,
    HTTPResponseError,
};
