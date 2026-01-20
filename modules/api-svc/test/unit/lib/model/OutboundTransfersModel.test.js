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

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const FSPIOPTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.TransferState;
const StateMachine = require('javascript-state-machine');

const Model = require('~/lib/model').OutboundTransfersModel;
const PartiesModel = require('~/lib/model').PartiesModel;
const Cache = require('~/lib/cache');
const { MetricsClient } = require('~/lib/metrics');
const { logger } = require('~/lib/logger');

const mocks = require('./data/mocks');
const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');
const payeeParty = require('./data/payeeParty');
const quoteResponseTemplate = require('./data/quoteResponse');
const transferFulfil = require('./data/transferFulfil');

const { SDKStateEnum, CacheKeyPrefixes, States, ErrorMessages, AmountTypes } = require('../../../../src/lib/model/common');

const genPartyId = (party) => {
    const { partyIdType, partyIdentifier, partySubIdOrType } = party.body.party.partyIdInfo;
    return PartiesModel.channelName({
        type: partyIdType,
        id: partyIdentifier,
        subId: partySubIdOrType
    });
};

// util function to simulate a party resolution subscription message on a cache client
const emitPartyCacheMessage = (cache, party) => cache.publish(genPartyId(party), JSON.stringify(party));
const emitMultiPartiesCacheMessage = (cache, party) => cache.add(genPartyId(party), JSON.stringify(party));

// util function to simulate a quote response subscription message on a cache client
const emitQuoteResponseCacheMessage = (cache, quoteId, quoteResponse) => cache.publish(`qt_${quoteId}`, JSON.stringify(quoteResponse));

// util function to simulate a transfer fulfilment subscription message on a cache client
const emitTransferFulfilCacheMessage = (cache, transferId, fulfil) => cache.publish(`tf_${transferId}`, JSON.stringify(fulfil));

const dummyRequestsModuleResponse = {
    originalRequest: {}
};

describe('OutboundTransfersModel Tests', () => {
    let quoteResponse;
    let config;
    let cache;
    let metricsClient;

    const createAndInitModel = async (customConfig = {}) => {
        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
            ...customConfig
        });
        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));
        return model;
    };

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
    async function testTransferWithDelay({expirySeconds, delays, rejects}) {
        const config = JSON.parse(JSON.stringify(defaultConfig));
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.expirySeconds = expirySeconds;
        config.rejectExpiredQuoteResponses = rejects.quoteResponse;
        config.rejectExpiredTransferFulfils = rejects.transferFulfils;

        // simulate a callback with the resolved party
        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return {
                originalRequest: {
                    headers: [],
                    body: {},
                }
            };
        });

        // simulate a delayed callback with the quote response
        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            setTimeout(() => {
                emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            }, delays.requestQuotes ? delays.requestQuotes * 1000 : 0);
            return {
                originalRequest: {
                    headers: [],
                    body: postQuotesBody,
                }
            };
        });

        // simulate a delayed callback with the transfer fulfilment
        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            setTimeout(() => {
                emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            }, delays.prepareTransfer ? delays.prepareTransfer * 1000 : 0);
            return {
                originalRequest: {
                    headers: [],
                    body: postTransfersBody,
                }
            };
        });

        const model = new Model({
            ...config,
            cache,
            logger,
            metricsClient,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)), {traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', baggage: 'key1=val1,key2=val2'});

        let expectError;
        if (rejects.quoteResponse && delays.requestQuotes && expirySeconds < delays.requestQuotes) {
            expectError = 'Quote response missed expiry deadline';
        }
        if (rejects.transferFulfils && delays.prepareTransfer && expirySeconds < delays.prepareTransfer) {
            expectError = 'Transfer fulfil missed expiry deadline';
        }
        if (expectError) {
            await expect(model.run()).rejects.toThrow(expectError);
        } else {
            const result = await model.run();
            await expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        }
    }

    beforeAll(async () => {
        quoteResponse = JSON.parse(JSON.stringify(quoteResponseTemplate));
        metricsClient = new MetricsClient();
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve(dummyRequestsModuleResponse));
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve(dummyRequestsModuleResponse));
        MojaloopRequests.__putQuotes = jest.fn(() => Promise.resolve(dummyRequestsModuleResponse));
        MojaloopRequests.__putQuotesError = jest.fn(() => Promise.resolve(dummyRequestsModuleResponse));
        MojaloopRequests.__postQuotes = jest.fn((body) => Promise.resolve({
            originalRequest: {
                headers: [],
                body: body,
            }
        }));
        MojaloopRequests.__postTransfers = jest.fn((body) => Promise.resolve({
            originalRequest: {
                headers: [],
                body: body,
            }
        }));
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
        const model = await createAndInitModel();
        expect(StateMachine.__instance.state).toBe('start');
        expect(model.data.transferId).toEqual(expect.any(String));
        expect(model.data.traceId).toEqual(expect.any(String));
        expect(model.data.traceId.length).toBe(32);
    });

    test('executes all three transfer stages without halting when AUTO_ACCEPT_PARTY and AUTO_ACCEPT_QUOTES are true', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
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
            return Promise.resolve(dummyRequestsModuleResponse);
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
            expect(model.data.to.fspId).toBe(payeeParty.body.party.partyIdInfo.fspId);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // make sure no PATCH was sent as we did not set config or receive a RESERVED state
        expect(MojaloopRequests.__patchTransfers).toHaveBeenCalledTimes(0);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('sends a PATCH /transfers/{transferId} request to payee DFSP when SEND_FINAL_NOTIFICATION_IF_REQUESTED is true', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.sendFinalNotificationIfRequested = true;
        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
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
            return Promise.resolve(dummyRequestsModuleResponse);
        });
        const pb = JSON.parse(JSON.stringify(transferFulfil));
        pb.data.body.transferState = FSPIOPTransferStateEnum.RESERVED;
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
            expect(model.data.to.fspId).toBe(payeeParty.body.party.partyIdInfo.fspId);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);
            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, pb);
            return Promise.resolve(dummyRequestsModuleResponse);
        });
        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });
        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
        // start the model running
        const result = await model.run();
        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__patchTransfers).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][0]).toEqual(model.data.transferId);
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][1].transferState).toEqual(FSPIOPTransferStateEnum.COMMITTED);
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][1].completedTimestamp).not.toBeUndefined();
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][2]).toEqual(quoteResponse.data.headers['fspiop-source']);


        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('uses quote response transfer amount for transfer prepare', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        // change the the transfer amount and currency in the quote response
        // so it is different to the initial request
        quoteResponse.data.body.transferAmount = {
            currency: 'XYZ',
            amount: '9876543210'
        };

        expect(quoteResponse.data.body.transferAmount).not.toEqual({
            amount: transferRequest.amount,
            currency: transferRequest.currency
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
            return Promise.resolve(dummyRequestsModuleResponse);
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
            expect(model.data.to.fspId).toBe(payeeParty.body.party.partyIdInfo.fspId);
            expect(quoteResponse.data.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            expect(postTransfersBody.amount).toEqual(quoteResponse.data.body.transferAmount);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // make sure no PATCH was sent as we did not set config or receive a RESERVED state
        expect(MojaloopRequests.__patchTransfers).toHaveBeenCalledTimes(0);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    describe('getTransfer state Tests -->', () => {
        MojaloopRequests.__getTransfers = jest.fn((transferId) => {
            emitTransferFulfilCacheMessage(cache, transferId, transferFulfil);
            return Promise.resolve();
        });

        let model;

        beforeEach(async () => {
            model = new Model({
                cache,
                logger,
                metricsClient,
                ...config,
            });
        });

        test('test get transfer', async () => {
            const TRANSFER_ID = 'tx-id000011';

            await model.initialize(JSON.parse(JSON.stringify({
                currentState: 'getTransfer',
                transferId: TRANSFER_ID,
            })));

            expect(StateMachine.__instance.state).toBe('getTransfer');

            // start the model running
            const result = await model.run();

            expect(MojaloopRequests.__getTransfers).toHaveBeenCalledTimes(1);

            // check we stopped at payeeResolved state
            expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
            expect(StateMachine.__instance.state).toBe('succeeded');
        });

        test('should NOT override existing transfer state in cache', async () => {
            const TRANSFER_ID = `tx-${Date.now()}`;
            const CACHE_KEY = `transferModel_out_${TRANSFER_ID}`;
            const txInCache = {
                homeTransactionId: '123-ABC',
                from: { idType: 'MSISDN' },
            };
            await cache.set(CACHE_KEY, txInCache); // simulate previous successful transfer

            let cached = await cache.get(CACHE_KEY);
            expect(cached).toMatchObject(txInCache);

            await model.initialize({
                currentState: 'getTransfer',
                transferId: TRANSFER_ID,
            });
            const result = await model.run();

            expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
            expect(MojaloopRequests.__getTransfers).toHaveBeenCalledTimes(1);
            expect(StateMachine.__instance.state).toBe('succeeded');

            cached = await cache.get(CACHE_KEY);
            expect(cached).toMatchObject(txInCache);
        });
    });

    test('resolves payee and halts when AUTO_ACCEPT_PARTY is false', async () => {
        config.autoAcceptParty = false;

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');
    });

    test('uses payee party fspid as source header when supplied - resolving payee', async () => {
        config.autoAcceptParty = false;

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        let req = JSON.parse(JSON.stringify(transferRequest));
        const testFspId = 'TESTDESTFSPID';
        req.to.fspId = testFspId;

        await model.initialize(req);

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const otelHeaders = expect.objectContaining({
            traceparent: expect.any(String)
        });
        // check getParties mojaloop requests method was called with the correct arguments
        expect(MojaloopRequests.__getParties).toHaveBeenCalledWith(req.to.idType, req.to.idValue, req.to.idSubValue, testFspId, otelHeaders);
    });

    test('resolves multiple payees and halts', async () => {
        config.autoAcceptParty = false;
        config.multiplePartiesResponse = true;
        config.multiplePartiesResponseSeconds = 2;
        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });
        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
        // start the model running
        const resultPromise = model.run();
        // now we started the model running we simulate a callback with the resolved party
        const payeeParty1 = JSON.parse(JSON.stringify(payeeParty));
        payeeParty1.body.party.partyIdInfo.fspId = 'FirstFspId';
        await emitMultiPartiesCacheMessage(cache, payeeParty1);
        const payeeParty2 = JSON.parse(JSON.stringify(payeeParty));
        payeeParty2.body.party.partyIdInfo.fspId = 'SecondFspId';
        await emitMultiPartiesCacheMessage(cache, payeeParty2);
        // wait for the model to reach a terminal state
        const result = await resultPromise;
        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');
        expect(result.to[0].fspId).toEqual('FirstFspId');
        expect(result.to[1].fspId).toEqual('SecondFspId');
    });

    test('halts after resolving payee, resumes and then halts after receiving quote response when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run({ acceptParty: true });
        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');
    });

    test('Allows change of transferAmount at accept party phase', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));

        // record the initial requested transfer amount
        const initialAmount = req.amount;

        await model.initialize(req);

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        expect(result.amount).toEqual(initialAmount);

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const resume = {
            amount: 999,
            acceptParty: true,
        };

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run(resume);

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // check the accept party key got merged to the state
        expect(result.acceptParty).toEqual(true);

        // check the amount key got changed
        expect(result.amount).toEqual(resume.amount);

        // check the quote request amount is the NEW amount, not the initial amount
        expect(result.quoteRequest.body.amount.amount).toStrictEqual(resume.amount);
        expect(result.quoteRequest.body.amount.amount).not.toEqual(initialAmount);
    });

    test('Allows change of payee party at accept party phase (round-robin support)', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));

        // record the initial requested transfer amount
        const initialAmount = req.amount;

        await model.initialize(req);

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        expect(result.amount).toEqual(initialAmount);

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const newPayee = {
            partyIdInfo: {
                partySubIdOrType: undefined,
                partyIdType: 'PASSPORT',
                partyIdentifier: 'AAABBBCCCDDDEEE',
                fspId: 'TESTDFSP'
            }
        };

        const newPayeeInternal = {
            idType: newPayee.partyIdInfo.partyIdType,
            idValue: newPayee.partyIdInfo.partyIdentifier,
            fspId: newPayee.partyIdInfo.fspId,
        };

        const resume = {
            acceptParty: true,
            to: newPayeeInternal,
        };

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run(resume);

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // check the accept party key got merged to the state
        expect(result.acceptParty).toEqual(true);

        // check the "to" passed in to model resume is merged into the model state correctly
        expect(result.to).toStrictEqual(newPayeeInternal);

        // check the quote request payee party is the NEW one, not the initial one.
        expect(result.quoteRequest.body.payee).toStrictEqual(newPayee);
    });

    test('Does not merge resume data keys into state that are not permitted', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));

        // record the initial requested transfer amount
        const initialAmount = req.amount;

        await model.initialize(req);

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        expect(result.amount).toEqual(initialAmount);

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const resume = {
            amount: 999,
            acceptParty: true,
            someRandomKey: 'this key name is not permitted',
        };

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run(resume);

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // check the accept party key got merged to the state
        expect(result.acceptParty).toEqual(true);

        // check the amount key got changed
        expect(result.amount).toEqual(resume.amount);

        // check the quote request amount is the NEW amount, not the initial amount
        expect(result.quoteRequest.body.amount.amount).toStrictEqual(resume.amount);
        expect(result.quoteRequest.body.amount.amount).not.toEqual(initialAmount);

        // check that our disallowed key is not merged to the transfer state
        expect(result.someRandomKey).toBeUndefined();
    });

    test('skips resolving party when to.fspid is specified and skipPartyLookup is truthy', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        let req = JSON.parse(JSON.stringify(transferRequest));
        const testFspId = 'TESTDESTFSPID';
        req.to.fspId = testFspId;
        req.skipPartyLookup = true;

        await model.initialize(req);

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');
    });

    test('aborts after party rejected by backend', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again with a party rejection. this should trigger transition to quote request
        result = await model.run({ resume: { acceptParty: false } });

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.ABORTED);
        expect(result.abortedReason).toBe('Payee rejected by backend');
        expect(StateMachine.__instance.state).toBe('aborted');
    });

    test('aborts after quote rejected by backend', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run({ acceptParty: true });

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach quote received
        result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger abort as the quote was not accepted
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe(SDKStateEnum.ABORTED);
        expect(result.abortedReason).toBe(ErrorMessages.quoteRejectedByBackend);
        expect(StateMachine.__instance.state).toBe('aborted');
    });

    test('should handle unknown state with a meaningful error message', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify({
            ...transferRequest,
            currentState: 'abc'
        })));

        expect(StateMachine.__instance.state).toBe('abc');

        // start the model running
        let resultPromise = model.run();

        // wait for the model to reach a terminal state
        let result = await resultPromise;
        expect(result).toBe(undefined);
    });

    test('should handle subsequent put transfer calls incase of aborted transfer', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run({ acceptParty: true });

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach quote received
        result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger abort as the quote was not accepted
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe(SDKStateEnum.ABORTED);
        expect(result.abortedReason).toBe(ErrorMessages.quoteRejectedByBackend);
        expect(StateMachine.__instance.state).toBe('aborted');

        // now run the model again. this should get the same result as previous one
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe(SDKStateEnum.ABORTED);
        expect(result.abortedReason).toBe(ErrorMessages.quoteRejectedByBackend);
        expect(StateMachine.__instance.state).toBe('aborted');
    });

    test('halts and resumes after parties and quotes stages when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        config.autoAcceptParty = false;
        config.autoAcceptQuotes = false;

        let model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        emitPartyCacheMessage(cache, payeeParty);

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run({ acceptParty: true });

        // now we started the model running we simulate a callback with the quote response
        cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // load a new model from the saved state
        model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run({ acceptQuote: true });

        // now we started the model running we simulate a callback with the transfer fulfilment
        cache.publish(`tf_${model.data.transferId}`, JSON.stringify(transferFulfil));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('uses payee party fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is false', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.useQuoteSourceFSPAsTransferPayeeFSP = false;

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
            const payeeFsp = MojaloopRequests.__postTransfers.mock.calls[0][0].payeeFsp;
            expect(payeeFsp).toEqual(payeeParty.body.party.partyIdInfo.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('uses quote response source fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is true', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.useQuoteSourceFSPAsTransferPayeeFSP = true;

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.data.headers['fspiop-source']);
            expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
            const payeeFsp = MojaloopRequests.__postTransfers.mock.calls[0][0].payeeFsp;
            expect(payeeFsp).toEqual(quoteResponse.data.headers['fspiop-source']);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('pass quote response `expiration` deadline', () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                requestQuotes: 1,
            },
            rejects: {
                quoteResponse: true,
            }
        })
    );

    test('pass transfer fulfills `expiration` deadline', () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                prepareTransfer: 1,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );

    test('pass all stages `expiration` deadlines', () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                requestQuotes: 1,
                prepareTransfer: 1,
            },
            rejects: {
                quoteResponse: true,
                transferFulfils: true,
            }
        })
    );

    test('fail on quote response `expiration` deadline', () =>
        testTransferWithDelay({
            expirySeconds: 1,
            delays: {
                requestQuotes: 2,
            },
            rejects: {
                quoteResponse: true,
            }
        })
    );

    test('fail on transfer fulfills `expiration` deadline', () =>
        testTransferWithDelay({
            expirySeconds: 1,
            delays: {
                prepareTransfer: 2,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );

    test('Throws with mojaloop error in response body when party resolution error callback occurs', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.publish(genPartyId(payeeParty), JSON.stringify(expectError));
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const expectError = {
            body: {
                errorInformation: {
                    errorCode: '3204',
                    errorDescription: 'Party not found'
                }
            }
        };

        const errMsg = 'Got an error response resolving party: {"errorInformation":{"errorCode":"3204","errorDescription":"Party not found"}}';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.body);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when quote request error callback occurs', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;

        const expectError = {
            type: 'quoteResponseError',
            data: {
                body: {
                    errorInformation: {
                        errorCode: '3205',
                        errorDescription: 'Quote ID not found'
                    }
                },
                headers: {}
            }
        };


        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // simulate a callback with the quote response
            cache.publish(`qt_${postQuotesBody.quoteId}`, JSON.stringify(expectError));
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const errMsg = 'Got an error response requesting quote: {"errorInformation":{"errorCode":"3205","errorDescription":"Quote ID not found"}}';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data.body);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when transfer request error callback occurs', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;

        const expectError = {
            type: 'transferError',
            data: {
                body: {
                    errorInformation: {
                        errorCode: '4001',
                        errorDescription: 'Payer FSP insufficient liquidity'
                    }
                }
            }
        };

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // simulate a callback with the quote response
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            // simulate an error callback with the transfer fulfilment
            cache.publish(`tf_${postTransfersBody.transferId}`, JSON.stringify(expectError));
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const errMsg = 'Got an error response preparing transfer: {"errorInformation":{"errorCode":"4001","errorDescription":"Payer FSP insufficient liquidity"}}';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data.body);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    async function testTlsServer(enableTls) {
        config.outbound.tls.mutualTLS.enabled = enableTls;

        new Model({
            cache,
            logger,
            metricsClient,
            ...config
        });

        const scheme = enableTls ? 'https' : 'http';
        expect(MojaloopRequests.__instance.transportScheme).toBe(scheme);
    }

    test('Outbound server should use HTTPS if outbound mTLS enabled', () =>
        testTlsServer(true));

    test('Outbound server should use HTTP if outbound mTLS disabled', () =>
        testTlsServer(false));

    test('Outbound transfers model should record metrics', async () => {
        const metrics = await metricsClient._prometheusRegister.metrics();
        expect(metrics).toBeTruthy();

        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_party_lookup_request_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_party_lookup_response_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_quote_request_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_quote_response_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_transfer_prepare_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_transfer_fulfil_response_count'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_quote_request_latency'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_transfer_latency'));
        expect(metrics).toEqual(expect.stringContaining('mojaloop_connector_outbound_party_lookup_latency'));
    });

    test('should use quoteExpirySeconds override when set', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        const customQuoteExpirySeconds = 10;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            expect(postQuotesBody.expiration).toBeTruthy();
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));
        req.quoteExpirySeconds = customQuoteExpirySeconds;

        await model.initialize(req);

        const getExpirationTimestampSpy = jest.spyOn(model, '_getExpirationTimestamp');

        const result = await model.run();

        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(getExpirationTimestampSpy).toHaveBeenCalledWith(customQuoteExpirySeconds);

        getExpirationTimestampSpy.mockRestore();
    });

    test('should use default expirySeconds when quoteExpirySeconds is not set', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        const defaultExpirySeconds = config.expirySeconds;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        const getExpirationTimestampSpy = jest.spyOn(model, '_getExpirationTimestamp');

        const result = await model.run();

        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(getExpirationTimestampSpy).toHaveBeenCalledWith(defaultExpirySeconds);

        getExpirationTimestampSpy.mockRestore();
    });

    test('should use prepareExpirySeconds override when set', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        const customPrepareExpirySeconds = 15;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            expect(postTransfersBody.expiration).toBeTruthy();
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));
        req.prepareExpirySeconds = customPrepareExpirySeconds;

        await model.initialize(req);

        const getExpirationTimestampSpy = jest.spyOn(model, '_getExpirationTimestamp');

        const result = await model.run();

        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(getExpirationTimestampSpy).toHaveBeenCalledWith(customPrepareExpirySeconds);

        getExpirationTimestampSpy.mockRestore();
    });

    test('should use default expirySeconds when prepareExpirySeconds is not set', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        const defaultExpirySeconds = config.expirySeconds;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        const getExpirationTimestampSpy = jest.spyOn(model, '_getExpirationTimestamp');

        const result = await model.run();

        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(getExpirationTimestampSpy).toHaveBeenCalledWith(defaultExpirySeconds);

        getExpirationTimestampSpy.mockRestore();
    });

    test('should reject quote response when expired and rejectExpiredQuoteResponses is true with quoteExpirySeconds override', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.rejectExpiredQuoteResponses = true;
        const customQuoteExpirySeconds = 1;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // simulate a delayed callback with the quote response
            setTimeout(() => {
                emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            }, 2000);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));
        req.quoteExpirySeconds = customQuoteExpirySeconds;

        await model.initialize(req);

        await expect(model.run()).rejects.toThrow('Quote response missed expiry deadline');
    });

    test('should reject transfer fulfil when expired and rejectExpiredTransferFulfils is true with prepareExpirySeconds override', async () => {
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
        config.rejectExpiredTransferFulfils = true;
        const customPrepareExpirySeconds = 1;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            emitQuoteResponseCacheMessage(cache, postQuotesBody.quoteId, quoteResponse);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody) => {
            // simulate a delayed callback with the transfer fulfilment
            setTimeout(() => {
                emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            }, 2000);
            return Promise.resolve(dummyRequestsModuleResponse);
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const req = JSON.parse(JSON.stringify(transferRequest));
        req.prepareExpirySeconds = customPrepareExpirySeconds;

        await model.initialize(req);

        await expect(model.run()).rejects.toThrow('Transfer fulfil missed expiry deadline');
    });

    describe('FX flow Tests -->', () => {
        const TARGET_AMOUNT = '48000';
        let model;

        const publishAndReply = async (channel, payload) => {
            await cache.publish(channel, JSON.stringify(payload));
            return mocks.mockMojaApiResponse();
        };

        const makeGetPartiesCallbackResponse = (body = mocks.mockGetPartyResponse())  =>
            jest.fn(async (idType, idValue, idSubValue) => {
                const channel = `parties-${idType}-${idValue}-${idSubValue}`;
                await cache.publish(channel, JSON.stringify({ body }));
                // note, putParties message doesn't have "data" field
                return mocks.mockMojaApiResponse();
            });

        const postFxQuotesRequest = jest.fn(async (payload) => {
            const channel = `${CacheKeyPrefixes.FX_QUOTE_CALLBACK_CHANNEL}_${payload.conversionRequestId}`;
            // eslint-disable-next-line no-unused-vars
            const { conversionRequestId, ...restPayload} = payload;
            restPayload.conversionTerms.targetAmount.amount = TARGET_AMOUNT; // todo: find a better way
            return publishAndReply(channel, {
                success: true,
                data: {
                    body: {
                        ...restPayload,
                        condition: 'fxCondition'
                    },
                    headers: {},
                }
            });
        });

        const postQuotesRequest = jest.fn(async (payload) => {
            const channel = `qt_${payload.quoteId}`;
            return publishAndReply(channel, {
                data: {
                    body: mocks.mockPutQuotesResponse(),
                    headers: {},
                },
                type: 'quoteResponse'
            });

        });

        const postFxTransfersRequest = jest.fn(async (payload) => {
            const channel = `${CacheKeyPrefixes.FX_TRANSFER_CALLBACK_CHANNEL}_${payload.commitRequestId}`;
            return publishAndReply(channel, {
                success: true,
                data: {
                    body: { ...payload },
                    headers: {},
                }
            });
        });

        const postFxTransfersRequestReturnedInvalidFulfilment = jest.fn(async (payload) => {
            const channel = `${CacheKeyPrefixes.FX_TRANSFER_CALLBACK_CHANNEL}_${payload.commitRequestId}`;
            return publishAndReply(channel, {
                success: true,
                data: {
                    body: {
                        ...mocks.mockFxTransfersInternalResponse(),
                        fulfilment: 'invalid-fulfilment'
                    },
                    headers: {},
                }
            });
        });

        const postTransfersRequest = jest.fn(async (payload) => {
            const channel = `tf_${payload.transferId}`;
            return publishAndReply(channel, {
                data: {},
                type: 'transferFulfil'
            });
        });

        beforeEach(() => {
            model = new Model({
                cache,
                logger,
                metricsClient,
                ...config,
            });
            model._checkIlp = false;
            model._requests.getParties = makeGetPartiesCallbackResponse();
            model._requests.postFxQuotes = postFxQuotesRequest;
            model._requests.postQuotes = postQuotesRequest;
            model._requests.postFxTransfers = postFxTransfersRequest;
            model._requests.postTransfers = postTransfersRequest;
        });

        afterEach(async () => {
            jest.clearAllMocks();
        });

        test.todo('should throw error if fxp providers found');

        test('should throw error if payee empty supported currencies returned', async () => {
            const partyWithEmptySupportedCurrencies = mocks.mockGetPartyResponse({
                supportedCurrencies: []
            });
            model._requests.getParties = makeGetPartiesCallbackResponse(partyWithEmptySupportedCurrencies);
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.START,
            });
            expect(model.data.currentState).toBe(States.START);
            await expect(model.run())
                .rejects.toThrow(ErrorMessages.noSupportedCurrencies);
        });

        test('should wait for acceptQuotes callback if FX is needed and amountType is RECEIVE', async () => {
            const amountType = AmountTypes.RECEIVE;
            const partyWithAnotherCurrency = mocks.mockGetPartyResponse({
                supportedCurrencies: ['XXX']
            });
            model._requests.getParties = makeGetPartiesCallbackResponse(partyWithAnotherCurrency);
            model._autoAcceptQuotes = false;
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto({ amountType }),
                currentState: States.START,
            });
            expect(model.data.currentState).toBe(States.START);

            const result = await model.run();
            expect(result.needFx).toBe(true);
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
        });

        test('should process callback for POST fxQuotes request', async () => {
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.PAYEE_RESOLVED,
                needFx: true,
                supportedCurrencies: ['USD']
            });
            expect(model.data.currentState).toBe(States.PAYEE_RESOLVED);

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(result.fxQuoteRequest).toBeTruthy();
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_CONVERSION_ACCEPTANCE);
            expect(model.data.currentState).toBe(States.FX_QUOTE_RECEIVED);
        });

        test('should throw error on expired quote response when config rejectExpiredQuoteResponses is truthy', async () => {
            model._rejectExpiredQuoteResponses = true;
            // replace function to return expired timestamp
            model._getExpirationTimestamp = () => {
                let now = new Date();
                return new Date(now.getTime() - 1000).toISOString();
            };
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.PAYEE_RESOLVED,
                needFx: true,
                supportedCurrencies: ['USD'],
            });
            expect(model.data.currentState).toBe(States.PAYEE_RESOLVED);
            await expect(model.run()).rejects.toThrow(`${ErrorMessages.responseMissedExpiryDeadline} (fxQuote)`);
        });

        test('should process callback for POST fxTransfers request', async () => {
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesPayload(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                },
                quoteRequest: {}
            });
            expect(model.data.currentState).toBe(States.QUOTE_RECEIVED);

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(result.fxTransferRequest).toBeTruthy();
            expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
            expect(model.data.currentState).toBe(States.SUCCEEDED);
            expect(model._requests.postTransfers).toHaveBeenCalledTimes(1);
        });

        test('should throw error on expired fxtransfer fulfil when config rejectExpiredTransferFulfils is truthy', async () => {
            model._rejectExpiredTransferFulfils = true;
            // replace function to return expired timestamp
            model._getExpirationTimestamp = () => {
                let now = new Date();
                return new Date(now.getTime() - 1000).toISOString();
            };
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesPayload(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                }
            });
            expect(model.data.currentState).toBe(States.QUOTE_RECEIVED);
            await expect(model.run()).rejects.toThrow(`${ErrorMessages.responseMissedExpiryDeadline} (fxTransfers fulfil)`);
        });

        test('should throw error on invalid transfer fulfil when config checkIlp is truthy', async () => {
            model._checkIlp = true;
            model._requests.postFxTransfers = postFxTransfersRequestReturnedInvalidFulfilment;
            // replace ilp validation function since it's mocked for one test
            model._ilp = { validateFulfil: jest.fn(() => false) };
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesResponse(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                }
            });
            expect(model.data.currentState).toBe(States.QUOTE_RECEIVED);
            await expect(model.run()).rejects.toThrow(ErrorMessages.invalidFulfilment);
        });

        test('should pass e2e FX transfer SEND flow (no autoAccept... configs)', async () => {
            model._autoAcceptParty = false;
            model._autoAcceptQuotes = false;

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto({ amountType: AmountTypes.SEND })
            });
            expect(model.data.currentState).toBe(States.START);

            let result = await model.run();
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
            expect(model.data.currentState).toBe(States.PAYEE_RESOLVED);
            expect(model.data.needFx).toBe(true);

            result = await model.run({ acceptParty: true });
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_CONVERSION_ACCEPTANCE);
            expect(result.fxQuoteRequest).toBeTruthy();
            expect(model.data.currentState).toBe(States.FX_QUOTE_RECEIVED);

            result = await model.run({ acceptConversion: true });
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
            expect(model.data.currentState).toBe(States.QUOTE_RECEIVED);
            expect(model._requests.postQuotes).toHaveBeenCalledTimes(1);

            const [quote] = model._requests.postQuotes.mock.calls[0];
            expect(quote.amount.currency).toBe(model.data.supportedCurrencies[0]);
            expect(quote.amount.amount).toBe(TARGET_AMOUNT);

            result = await model.run({ acceptQuote: true });
            expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
            expect(model.data.currentState).toBe(States.SUCCEEDED);
        });

        test('should pass e2e FX transfer RECEIVE flow (no autoAccept... configs)', async () => {
            model._autoAcceptParty = false;
            model._autoAcceptQuotes = false;
            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto({ amountType: AmountTypes.RECEIVE })
            });
            expect(model.data.currentState).toBe(States.START);

            let result = await model.run();
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
            expect(model.data.currentState).toBe(States.PAYEE_RESOLVED);
            expect(model.data.needFx).toBe(true);

            result = await model.run({ acceptParty: true });
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_QUOTE_ACCEPTANCE);
            expect(result.quoteResponse).toBeTruthy();
            expect(model.data.currentState).toBe(States.QUOTE_RECEIVED);

            result = await model.run({ acceptQuote: true });
            expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_CONVERSION_ACCEPTANCE);
            expect(result.fxQuoteResponse).toBeTruthy();
            expect(model.data.currentState).toBe(States.FX_QUOTE_RECEIVED);

            result = await model.run({ acceptConversion: true });
            expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
            expect(model.data.currentState).toBe(States.SUCCEEDED);
        });

        test('should use fxQuoteExpirySeconds override when set', async () => {
            model._rejectExpiredQuoteResponses = true;
            const customFxQuoteExpirySeconds = 5;

            // Mock expiration to return a future timestamp
            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() + (customFxQuoteExpirySeconds * 1000)).toISOString();
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.PAYEE_RESOLVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                fxQuoteExpirySeconds: customFxQuoteExpirySeconds,
            });

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(result.fxQuoteRequest).toBeTruthy();
            expect(model.data.fxQuoteExpiration).toBeTruthy();
            expect(model._getExpirationTimestamp).toHaveBeenCalledWith(customFxQuoteExpirySeconds);
        });

        test('should use default expirySeconds when fxQuoteExpirySeconds is not set', async () => {
            const defaultExpirySeconds = config.expirySeconds;

            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() + (defaultExpirySeconds * 1000)).toISOString();
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.PAYEE_RESOLVED,
                needFx: true,
                supportedCurrencies: ['USD'],
            });

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(model._getExpirationTimestamp).toHaveBeenCalledWith(defaultExpirySeconds);
        });

        test('should use default expirySeconds when fxPrepareExpirySeconds is not set', async () => {
            const defaultExpirySeconds = config.expirySeconds;

            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() + (defaultExpirySeconds * 1000)).toISOString();
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesPayload(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                },
            });

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(result.fxTransferRequest).toBeTruthy();
            expect(model._getExpirationTimestamp).toHaveBeenCalledWith(defaultExpirySeconds);
        });

        test('should use fxPrepareExpirySeconds override when set', async () => {
            const customFxPrepareExpirySeconds = 20;

            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() + (customFxPrepareExpirySeconds * 1000)).toISOString();
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                fxPrepareExpirySeconds: customFxPrepareExpirySeconds,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesPayload(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                },
            });

            const result = await model.run();
            expect(result).toBeTruthy();
            expect(result.fxTransferRequest).toBeTruthy();
            expect(model._getExpirationTimestamp).toHaveBeenCalledWith(customFxPrepareExpirySeconds);
        });

        test('should reject fxQuote response when expired and rejectExpiredQuoteResponses is true with fxQuoteExpirySeconds override', async () => {
            model._rejectExpiredQuoteResponses = true;
            const customFxQuoteExpirySeconds = 1;

            // Mock expiration to return an expired timestamp
            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() - 2000).toISOString(); // 2 seconds in the past
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.PAYEE_RESOLVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                fxQuoteExpirySeconds: customFxQuoteExpirySeconds,
            });

            await expect(model.run()).rejects.toThrow(`${ErrorMessages.responseMissedExpiryDeadline} (fxQuote)`);
        });

        test('should reject fxTransfer fulfil when expired and rejectExpiredTransferFulfils is true with prepareExpirySeconds override', async () => {
            model._rejectExpiredTransferFulfils = true;
            const customPrepareExpirySeconds = 1;

            // Mock expiration to return an expired timestamp
            model._getExpirationTimestamp = jest.fn(() => {
                let now = new Date();
                return new Date(now.getTime() - 2000).toISOString(); // 2 seconds in the past
            });

            await model.initialize({
                ...mocks.coreConnectorPostTransfersPayloadDto(),
                currentState: States.QUOTE_RECEIVED,
                needFx: true,
                supportedCurrencies: ['USD'],
                acceptQuote: true,
                prepareExpirySeconds: customPrepareExpirySeconds,
                fxQuoteResponse: {
                    body: mocks.mockFxQuotesPayload(),
                },
                quoteResponse: {
                    body: {
                        transferAmount: {},
                    }
                },
            });

            await expect(model.run()).rejects.toThrow(`${ErrorMessages.responseMissedExpiryDeadline} (fxTransfers fulfil)`);
        });

    });
});
