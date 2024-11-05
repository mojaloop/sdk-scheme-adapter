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

const assert = require('assert').strict;
const util = require('util');
const {
    MojaloopRequests, Errors, WSO2Auth, Jws, Logger, common,
    Ilp: { ILP_VERSIONS }
} = jest.requireActual('@mojaloop/sdk-standard-components');

const mockMojaResponseFn = async () => Object.freeze({
    originalRequest: {
        headers: {},
        body: {},
    }
});

class MockMojaloopRequests extends MojaloopRequests {
    constructor(...args) {
        super(...args);
        MockMojaloopRequests.__instance = this;
        this.postParticipants = MockMojaloopRequests.__postParticipants;
        this.getParties = MockMojaloopRequests.__getParties;
        this.postTransactionRequests = MockMojaloopRequests.__postTransactionRequests;
        this.postQuotes = MockMojaloopRequests.__postQuotes;
        this.putQuotes = MockMojaloopRequests.__putQuotes;
        this.putQuotesError = MockMojaloopRequests.__putQuotesError;
        this.getAuthorizations = MockMojaloopRequests.__getAuthorizations;
        this.putAuthorizations = MockMojaloopRequests.__putAuthorizations;
        this.getTransfers = MockMojaloopRequests.__getTransfers;
        this.putTransactionRequests = MockMojaloopRequests.__putTransactionRequests;
        this.postTransfers = MockMojaloopRequests.__postTransfers;
        this.putTransfers = MockMojaloopRequests.__putTransfers;
        this.putTransfersError = MockMojaloopRequests.__putTransfersError;
        this.getBulkQuotes = MockMojaloopRequests.__getBulkQuotes;
        this.postBulkQuotes = MockMojaloopRequests.__postBulkQuotes;
        this.putBulkQuotes = MockMojaloopRequests.__putBulkQuotes;
        this.putBulkQuotesError = MockMojaloopRequests.__putBulkQuotesError;
        this.getBulkTransfers = MockMojaloopRequests.__getBulkTransfers;
        this.postBulkTransfers = MockMojaloopRequests.__postBulkTransfers;
        this.putBulkTransfers = MockMojaloopRequests.__putBulkTransfers;
        this.putBulkTransfersError = MockMojaloopRequests.__putBulkTransfersError;
        this.patchTransfers = MockMojaloopRequests.__patchTransfers;
        this.postFxQuotes = MockMojaloopRequests.__postFxQuotes;
        this.putFxQuotes = MockMojaloopRequests.__putFxQuotes;
        this.putFxQuotesError = MockMojaloopRequests.__putFxQuotesError;
        this.postFxTransfers = MockMojaloopRequests.__postFxTransfers;
        this.putFxTransfers = MockMojaloopRequests.__putFxTransfers;
        this.putFxTransfersError = MockMojaloopRequests.__putFxTransfersError;
    }
}
MockMojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postTransactionRequests = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postQuotes = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putQuotes = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putQuotesError = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__getAuthorizations = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putAuthorizations = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__getTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putTransactionRequests = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putTransfersError = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__getBulkQuotes = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postBulkQuotes = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putBulkQuotes = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putBulkQuotesError = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__getBulkTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postBulkTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putBulkTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__putBulkTransfersError = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__patchTransfers = jest.fn(() => Promise.resolve());
MockMojaloopRequests.__postFxQuotes = jest.fn(mockMojaResponseFn);
MockMojaloopRequests.__putFxQuotes = jest.fn(mockMojaResponseFn);
MockMojaloopRequests.__putFxQuotesError = jest.fn(mockMojaResponseFn);
MockMojaloopRequests.__postFxTransfers = jest.fn(mockMojaResponseFn);
MockMojaloopRequests.__putFxTransfers = jest.fn(mockMojaResponseFn);
MockMojaloopRequests.__putFxTransfersError = jest.fn(mockMojaResponseFn);

const Ilp = {
    ilpFactory: (version, options) => {
        switch(version) {
            case 'v1':
                return new MockIlpV1(options);
            case 'v4':
                throw new Error('v4 not supported by mock');
        }
    },
    ILP_VERSIONS
};

class MockIlpV1 {
    constructor(config) {
        assert(config.logger, 'Must supply a logger to Ilp constructor');
        this.logger = config.logger;
        this.logger.log('MockIlp constructed');
        this.config = config;
    }

    calculateFulfil(ilpPacket) {
        this.logger.log(`Mock ILP not calculating fulfil from ilp packet ${ilpPacket}`);
        return 'mockGeneratedFulfilment';
    }

    calculateConditionFromFulfil(fulfil) {
        this.logger.log(`Mock ILP not calculating condition from fulfil ${fulfil}`);
        return 'mockGeneratedCondition';
    }

    validateFulfil(fulfil, condition) {
        this.logger.log(`Mock ILP not checking fulfil ${fulfil} against condition ${condition}`);
        return true;
    }

    getResponseIlp(...args) {
        this.logger.log(`MockIlp.getResponseIlp called with args: ${util.inspect(args)}`);

        return Ilp.__response;
    }

    getQuoteResponseIlp(...args) {
        this.logger.log(`MockIlp.getQuoteResponseIlp called with args: ${util.inspect(args)}`);

        return this.getResponseIlp(...args);
    }

    getFxQuoteResponseIlp(...args) {
        this.logger.log(`MockIlp.getFxQuoteResponseIlp called with args: ${util.inspect(args)}`);

        return this.getResponseIlp(...args);
    }


    getTransactionObject(...args) {
        this.logger.log(`MockIlp.getTrasnactionObject called with args: ${util.inspect(args)}`);

        return Ilp.__transactionObject;
    }
}
Ilp.__response = {
    fulfilment: 'mockGeneratedFulfilment',
    ilpPacket: 'mockBase64encodedIlpPacket',
    condition: 'mockGeneratedCondition'
};

Ilp.__transactionObject = {
    transactionId: 'mockTransactionId'
};


class MockJwsValidator extends Jws.validator {
    constructor(config) {
        super(config);
        MockJwsValidator.__validationKeys = config.validationKeys;
        this.validate = MockJwsValidator.__validate;
    }
}
MockJwsValidator.__validate = jest.fn(() => true);


class MockJwsSigner {
    constructor(config) {
        assert(config.logger, 'Must supply a logger to JWS signer constructor');
        this.config = config;
        config.logger.log(`MockJwsSigner constructed with config: ${util.inspect(config)}`);
    }
}


module.exports = {
    Ilp,
    MojaloopRequests: MockMojaloopRequests,
    Jws: {
        validator: MockJwsValidator,
        signer: MockJwsSigner
    },
    Errors,
    WSO2Auth,
    Logger,
    common,
};
