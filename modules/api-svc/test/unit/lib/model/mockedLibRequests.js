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

const util = require('util');
const { BackendRequests } = jest.requireActual('~/lib/model/lib/requests');

const respErrSym = Symbol('ResponseErrorDataSym');

/**
 * A class for making requests to DFSP backend API
 */
class MockBackendRequests extends BackendRequests {
    constructor(...args) {
        super(...args);
        MockBackendRequests.__instance = this;
        this.getOTP = MockBackendRequests.__getOTP;
        this.getParties = MockBackendRequests.__getParties;
        this.postTransactionRequests = MockBackendRequests.__postTransactionRequests;
        this.postQuoteRequests = MockBackendRequests.__postQuoteRequests;
        this.getTransfers = MockBackendRequests.__getTransfers;
        this.postTransfers = MockBackendRequests.__postTransfers;
        this.getBulkQuotes = MockBackendRequests.__getBulkQuotes;
        this.postBulkQuotes = MockBackendRequests.__postBulkQuotes;
        this.getBulkTransfers = MockBackendRequests.__getBulkTransfers;
        this.postBulkTransfers = MockBackendRequests.__postBulkTransfers;
        this.putTransfersNotification = MockBackendRequests.__putTransfersNotification;
        this.postFxQuotes = MockBackendRequests.__postFxQuotes;
        this.postFxTransfers = MockBackendRequests.__postFxTransfers;
        this.putFxTransfersNotification = MockBackendRequests.__putFxTransfersNotification;
    }
}
MockBackendRequests.__getParties = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getOTP = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postTransactionRequests = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postQuoteRequests = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getBulkQuotes = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postBulkQuotes = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getBulkTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postBulkTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__putTransfersNotification = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postFxQuotes = jest.fn(async () => ({ body: {} }));
MockBackendRequests.__postFxTransfers = jest.fn(async () => ({ body: {} }));
MockBackendRequests.__putFxTransfersNotification = jest.fn(() => Promise.resolve({body: {}}));

class HTTPResponseError extends Error {
    constructor(params) {
        super(params.msg);
        this[respErrSym] = params;
    }

    getData() {
        return this[respErrSym];
    }

    toString() {
        return util.inspect(this[respErrSym]);
    }

    toJSON() {
        return JSON.stringify(this[respErrSym]);
    }
}


module.exports = {
    BackendRequests: MockBackendRequests,
    HTTPResponseError: HTTPResponseError
};
