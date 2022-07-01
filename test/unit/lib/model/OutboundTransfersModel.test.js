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

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const Cache = require('~/lib/cache');
const { MetricsClient } = require('~/lib/metrics');
const Model = require('~/lib/model').OutboundTransfersModel;
const PartiesModel = require('~/lib/model').PartiesModel;

const { MojaloopRequests, Logger } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');
const payeeParty = require('./data/payeeParty');
const quoteResponseTemplate = require('./data/quoteResponse');
const transferFulfil = require('./data/transferFulfil');

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

describe('outboundModel', () => {
    let quoteResponse;
    let config;
    let logger;
    let cache;
    let metricsClient;

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

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        let expectError;
        if (rejects.quoteResponse && delays.requestQuotes && expirySeconds < delays.requestQuotes) {
            expectError = 'Quote response missed expiry deadline';
        }
        if (rejects.transferFulfils && delays.prepareTransfer && expirySeconds < delays.prepareTransfer) {
            expectError = 'Transfer fulfil missed expiry deadline';
        }
        if (expectError) {
            await expect(model.run()).rejects.toThrowError(expectError);
        } else {
            const result = await model.run();
            await expect(result.currentState).toBe('COMPLETED');
        }
    }

    beforeAll(async () => {
        logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
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
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
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
        expect(result.currentState).toBe('COMPLETED');
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
        pb.data.body.transferState = 'RESERVED';
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
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][1].transferState).toEqual('COMMITTED');
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][1].completedTimestamp).not.toBeUndefined();
        expect(MojaloopRequests.__patchTransfers.mock.calls[0][2]).toEqual(quoteResponse.data.headers['fspiop-source']);


        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
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
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('test get transfer', async () => {
        MojaloopRequests.__getTransfers = jest.fn((transferId) => {
            emitTransferFulfilCacheMessage(cache, transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        const TRANSFER_ID = 'tx-id000011';

        await model.initialize(JSON.parse(JSON.stringify({
            ...transferRequest,
            currentState: 'getTransfer',
            transferId: TRANSFER_ID,
        })));

        expect(StateMachine.__instance.state).toBe('getTransfer');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // check getParties mojaloop requests method was called with the correct arguments
        expect(MojaloopRequests.__getParties).toHaveBeenCalledWith(req.to.idType, req.to.idValue, req.to.idSubValue, testFspId);
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('ABORTED');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger abort as the quote was not accepted
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe('ABORTED');
        expect(result.abortedReason).toBe('Quote rejected by backend');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger abort as the quote was not accepted
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe('ABORTED');
        expect(result.abortedReason).toBe('Quote rejected by backend');
        expect(StateMachine.__instance.state).toBe('aborted');

        // now run the model again. this should get the same result as previous one
        result = await model.run({ acceptQuote: false });

        expect(result.currentState).toBe('ABORTED');
        expect(result.abortedReason).toBe('Quote rejected by backend');
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
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
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
        expect(result.currentState).toBe('COMPLETED');
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
        expect(result.currentState).toBe('COMPLETED');
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
        expect(result.currentState).toBe('COMPLETED');
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

        const errMsg = 'Got an error response resolving party: { errorInformation: { errorCode: \'3204\', errorDescription: \'Party not found\' } }';

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

        const errMsg = 'Got an error response requesting quote: { errorInformation:\n   { errorCode: \'3205\', errorDescription: \'Quote ID not found\' } }';

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

        const errMsg = 'Got an error response preparing transfer: { errorInformation:\n   { errorCode: \'4001\',\n     errorDescription: \'Payer FSP insufficient liquidity\' } }';

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
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('quoteReceived');
    });

});
