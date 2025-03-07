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
 - Murthy Kakarlamudi <murthy@modusbox.com>
 --------------
 ******/
'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { createLogger } = require('~/lib/logger');
const Cache = require('~/lib/cache');
const Model = require('~/lib/model').OutboundRequestToPayTransferModel;

const { SDKStateEnum } = require('../../../../src/lib/model/common');

const defaultConfig = require('./data/defaultConfig');
const requestToPayTransferRequest = require('./data/requestToPayTransferRequest');
const quoteResponseTemplate = require('./data/quoteResponse');
const authorizationsResponse = require('./data/authorizationsResponse');
const transferFulfil = require('./data/transferFulfil');

// util function to simulate a quote response subscription message on a cache client
const emitQuoteResponseCacheMessage = (cache, quoteId, quoteResponse) => cache.publish(`qt_${quoteId}`, JSON.stringify(quoteResponse));

// util function to simulate a authorizations response subscription message on a cache client
const emitAuthorizationsResponseCacheMessage = (cache, authorizationsResponse) => cache.publish(`otp_${requestToPayTransferRequest.transactionRequestId}`, JSON.stringify(authorizationsResponse));

// util function to simulate a transfer fulfilment subscription message on a cache client
const emitTransferFulfilCacheMessage = (cache, transferId, fulfil) => cache.publish(`tf_${transferId}`, JSON.stringify(fulfil));

describe('outboundRequestToPayTransferModel', () => {
    let quoteResponse;
    let config;
    let logger;
    let cache;

    /**
     *
     * @param {Object} opts
     * @param {Number} opts.expirySeconds
     * @param {Object} opts.delays
     * @param {Number} delays.requestQuotes
     * @param {Number} delays.prepareTransfer
     * @param {Object} opts.rejects
     * @param {boolean} rejects.quoteResponse
     * @param {boolean} rejects.transferFulfils
     */


    beforeAll(async () => {
        logger = createLogger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
        quoteResponse = JSON.parse(JSON.stringify(quoteResponseTemplate));
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getAuthorizations = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotesError = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postTransfers = jest.fn(() => Promise.resolve());

        cache = new Cache({
            cacheUrl: 'redis://dummy:1234',
            logger,
            unsubscribeTimeoutMs: 5000
        });
        await cache.connect();
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('initializes to starting state', async () => {
        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayTransferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('If initiatorType is BUSINESS, executes all three transfer stages without halting when AUTO_ACCEPT_R2P_BUSINESS_QUOTES is true', async () => {
        config.autoAcceptR2PBusinessQuotes = true;

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'BUSINESS'
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('If initiatorType is BUSINESS, halts and resumes after quotes stage when AUTO_ACCEPT_R2P_BUSINESS_QUOTES is false', async () => {
        config.autoAcceptR2PBusinessQuotes = false;

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'BUSINESS'
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(0);
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(result.fulfil).toBe(undefined);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // start the model running
        const result2 = await model.run();
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
        expect(result2.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result2.fulfil.body.transferState).toBe('COMMITTED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('If initiatorType is BUSINESS, autoAcceptR2PDeviceOTP has no effect and executes all three transfer stages without halting when AUTO_ACCEPT_R2P_BUSINESS_QUOTES is true', async () => {
        config.autoAcceptR2PDeviceOTP = false;
        config.autoAcceptR2PBusinessQuotes = true;

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'BUSINESS'
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('If initiatorType is not BUSINESS, halts and resumes after quotes stage when AUTO_ACCEPT_R2P_DEVICE_OTP is false and authenticationType is null', async () => {
        config.autoAcceptR2PDeviceOTP = false;

        MojaloopRequests.__getAuthorizations = jest.fn(() => {
            emitAuthorizationsResponseCacheMessage(cache, authorizationsResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'DEVICE',
            authenticationType: null
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(0);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(0);
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(result.fulfil).toBe(undefined);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // start the model running
        const result2 = await model.run();
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
        expect(result2.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result2.fulfil.body.transferState).toBe('COMMITTED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('If initiatorType is not BUSINESS, halts and resumes after quotes stage when AUTO_ACCEPT_R2P_DEVICE_OTP is true and authenticationType is OTP', async () => {
        config.autoAcceptR2PDeviceOTP = true;

        MojaloopRequests.__getAuthorizations = jest.fn(() => {
            emitAuthorizationsResponseCacheMessage(cache, authorizationsResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'DEVICE',
            authenticationType: 'OTP'
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(0);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(0);
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(result.fulfil).toBe(undefined);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // start the model running
        const result2 = await model.run();
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
        expect(result2.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result2.fulfil.body.transferState).toBe('COMMITTED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('If initiatorType is not BUSINESS, halts and resumes after quotes and otp stages when AUTO_ACCEPT_R2P_DEVICE_OTP is false and authenticationType is OTP', async () => {
        config.autoAcceptR2PDeviceOTP = false;

        MojaloopRequests.__getAuthorizations = jest.fn(() => {
            emitAuthorizationsResponseCacheMessage(cache, authorizationsResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...requestToPayTransferRequest,
            initiatorType: 'DEVICE',
            authenticationType: 'OTP'
        })));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(0);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(0);
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(result.fulfil).toBe(undefined);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // start the model for continuation
        const result2 = await model.run();
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(0);
        expect(result2.currentState).toBe(SDKStateEnum.WAITING_FOR_AUTH_ACCEPTANCE);
        expect(result2.authorizationResponse.responseType).toBe('ENTERED');
        expect(StateMachine.__instance.state).toBe('otpReceived');

        // start the model for continuation
        const result3 = await model.run();
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
        expect(result3.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result3.fulfil.body.transferState).toBe('COMMITTED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

});
