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

const { createHttpRequester } = require('@mojaloop/sdk-standard-components').httpRequester;
const { buildUrl, HTTPResponseError } = require('./common');

// Single source of truth for this metric, shared by the eager preRegister() call and the
// lazy per-instance construction below so the two definitions can't drift apart.
const CALL_DURATION_HISTOGRAM_DEF = {
    name: 'mojaloop_connector_backend_call_duration_seconds',
    help: 'Duration of HTTP calls made by the SDK to the configured DFSP backend',
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    labelNames: ['method', 'operation'],
};

/**
 * Registers the histogram at process startup, so it appears on /metrics before the first
 * inbound request lazily constructs a BackendRequests instance.
 */
const preRegister = (metricsClient) => {
    metricsClient?.getHistogram(
        CALL_DURATION_HISTOGRAM_DEF.name,
        CALL_DURATION_HISTOGRAM_DEF.help,
        CALL_DURATION_HISTOGRAM_DEF.buckets,
        CALL_DURATION_HISTOGRAM_DEF.labelNames,
    );
};

/**
 * A class for making requests to DFSP backend API
 */
class BackendRequests {
    constructor(config) {
        this.config = config;
        this.logger = config.logger.push({ component: this.constructor.name });

        // Create HTTP requester with shared agents if available
        const httpConfig = {
            timeout: 65000,
            withCredentials: false,
            transitional: {
                clarifyTimeoutError: true,
            }
        };

        // Add shared agents to prevent connection recreation per request
        if (config.sharedAgents) {
            httpConfig.httpAgent = config.sharedAgents.httpAgent;
            httpConfig.httpsAgent = config.sharedAgents.httpsAgent;
            this.logger.isDebugEnabled && this.logger.debug('Using shared HTTP/HTTPS agents for BackendRequests');
        }

        this.requester = createHttpRequester({
            logger: this.logger,
            httpConfig
        });

        // Histogram of round-trip time for calls the SDK makes out to the DFSP backend,
        // labelled by HTTP method and backend operation (e.g. parties, quoterequests, transfers).
        this._callDurationHistogram = config.metricsClient?.getHistogram(
            CALL_DURATION_HISTOGRAM_DEF.name,
            CALL_DURATION_HISTOGRAM_DEF.help,
            CALL_DURATION_HISTOGRAM_DEF.buckets,
            CALL_DURATION_HISTOGRAM_DEF.labelNames,
        );

        // FSPID of THIS DFSP
        this.dfspId = config.dfspId;

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

    async putFxTransfersNotification(notification, conversionId) {
        const url = `fxTransfers/${conversionId}`;
        return this._put(url, notification);
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
        return this.sendRequest(reqOpts, url.split('/')[0]);
    }


    _put(url, body) {
        const reqOpts = {
            method: 'PUT',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts, url.split('/')[0]);
    }


    _post(url, body) {
        const reqOpts = {
            method: 'POST',
            uri: buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body),
        };
        return this.sendRequest(reqOpts, url.split('/')[0]);
    }

    _patch(url, body) {
        const reqOpts = {
            method: 'PATCH',
            uri : buildUrl(this.backendEndpoint, url),
            headers: this._buildHeaders(),
            body: JSON.stringify(body)
        };
        return this.sendRequest(reqOpts, url.split('/')[0]);
    }

    /**
     * @param {object} reqOptions
     * @param {string} [operation] - backend resource being called, e.g. 'parties', 'quoterequests', 'transfers'
     */
    async sendRequest(reqOptions, operation) {
        const endTimer = this._callDurationHistogram?.startTimer({
            method: reqOptions?.method,
            operation: operation || 'unknown',
        });
        try {
            this.logger.isVerboseEnabled && this.logger.push({ reqOptions }).verbose(`Executing HTTP ${reqOptions?.method}...`);
            const res = await this.requester.sendRequest({ ...reqOptions });

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
        } finally {
            endTimer?.();
        }
    }
}


module.exports = {
    BackendRequests,
    HTTPResponseError,
    preRegisterBackendMetrics: preRegister,
};
