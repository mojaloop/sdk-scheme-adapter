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

const util = require('util');
const { BackendRequests } = jest.requireActual('@internal/requests');

const respErrSym = Symbol('ResponseErrorDataSym');

/**
 * A class for making requests to DFSP backend API
 */
class MockBackendRequests extends BackendRequests {
    constructor(...args) {
        super(...args);
        MockBackendRequests.__instance = this;
        this.getOTP = MockBackendRequests.__getOTP;
        this.getSignedChallenge = MockBackendRequests.__getSignedChallenge;
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
    }
}
MockBackendRequests.__getParties = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getOTP = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getSignedChallenge = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postTransactionRequests = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postQuoteRequests = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getBulkQuotes = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postBulkQuotes = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__getBulkTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__postBulkTransfers = jest.fn(() => Promise.resolve({body: {}}));
MockBackendRequests.__putTransfersNotification = jest.fn(() => Promise.resolve({body: {}}));



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
