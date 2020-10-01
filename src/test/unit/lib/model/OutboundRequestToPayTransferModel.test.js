/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Murthy Kakarlamudi - murthy@modusbox.com                           *
 **************************************************************************/

'use strict';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const util = require('util');
const Cache = require('@internal/cache');
const Model = require('@internal/model').OutboundRequestToPayTransferModel;

const { MojaloopRequests, Logger } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');
const requestToPayTransferRequest = require('./data/requestToPayTransferRequest');
const quoteResponseTemplate = require('./data/quoteResponse');
const authorizationsResponse = require('./data/authorizationsResponse');
const transferFulfil = require('./data/transferFulfil');

// util function to simulate a quote response subscription message on a cache client
const emitQuoteResponseCacheMessage = (cache, quoteId, quoteResponse) => cache.publish(`qt_${quoteId}`, JSON.stringify(quoteResponse));

// util function to simulate a authorizations response subscription message on a cache client
const emitAuthorizationsResponseCacheMessage = (cache, authorizationsResponse) => cache.publish(`otp_${requestToPayTransferRequest.requestToPayTransactionId}`, JSON.stringify(authorizationsResponse));


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
        logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests-cache' } });
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
            host: 'dummycachehost',
            port: 1234,
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
            ...config,
            tls: config.outbound.tls,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayTransferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('executes all three transfer stages without halting when AUTO_ACCEPT_QUOTES and AUTO_ACCEPT_PARTY are true', async () => {
        config.autoAcceptR2PDeviceOTP = true;
        config.autoAcceptR2PDeviceQuotes = true;
        config.autoAcceptQuotes = true;

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
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.headers['fspiop-source']);
            expect(quoteResponse.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            emitTransferFulfilCacheMessage(cache, postTransfersBody.transferId, transferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
            tls: config.outbound.tls,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayTransferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__getAuthorizations).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    // test('halts and resumes after quotes and otp stages when AUTO_ACCEPT_QUOTES is false and AUTO_ACCEPT_OTP is false', async () => {
        
    //     config.autoAcceptR2PDeviceOTP = false;
    //     config.autoAcceptR2PDeviceQuotes = false;

    //     let model = new Model({
    //         cache,
    //         logger,
    //         ...config,
    //         tls: config.outbound.tls,
    //     });

    //     await model.initialize(JSON.parse(JSON.stringify(requestToPayTransferRequest)));

    //     expect(StateMachine.__instance.state).toBe('start');

    //     // start the model running
    //     let resultPromise = model.run();

    //     // now we started the model running we simulate a callback with the quote response
    //     cache.publish(`qt_${model.data.quoteId}`, JSON.stringify(quoteResponse));

    //     // wait for the model to reach a terminal state
    //     let result = await resultPromise;

    //     console.log(`Result after request quote: ${util.inspect(result)}`);

    //     // check we stopped at quoteReceived state
    //     expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
    //     expect(StateMachine.__instance.state).toBe('quoteReceived');

    //     const requestToPayTransactionId = requestToPayTransferRequest.requestToPayTransactionId;

    //     // load a new model from the saved state
    //     model = new Model({
    //         cache,
    //         logger,
    //         ...config,
    //         tls: config.outbound.tls,
    //     });

    //     await model.load(requestToPayTransactionId);

    //     // check the model loaded to the correct state
    //     expect(StateMachine.__instance.state).toBe('quoteReceived');

    //     // now run the model again. this should trigger transition to quote request
    //     resultPromise = model.run();

    //     // now we started the model running we simulate a callback with the otp response
    //     cache.publish(`otp_${requestToPayTransactionId}`, JSON.stringify(authorizationsResponse));

    //     // wait for the model to reach a terminal state
    //     result = await resultPromise;

    //     console.log(`Result after request otp: ${util.inspect(result)}`);

    //     // check we stopped at quoteReceived state
    //     expect(result.currentState).toBe('WAITING_FOR_OTP_ACCEPTANCE');
    //     expect(StateMachine.__instance.state).toBe('otpReceived');

    //     // load a new model from the saved state
    //     model = new Model({
    //         cache,
    //         logger,
    //         ...config,
    //         tls: config.outbound.tls,
    //     });

    //     await model.load(requestToPayTransactionId);

    //     // check the model loaded to the correct state
    //     expect(StateMachine.__instance.state).toBe('otpReceived');

    //     // now run the model again. this should trigger transition to quote request
    //     resultPromise = model.run();

    //     // now we started the model running we simulate a callback with the transfer fulfilment
    //     cache.publish(`tf_${model.data.transferId}`, JSON.stringify(transferFulfil));

    //     // wait for the model to reach a terminal state
    //     result = await resultPromise;

    //     console.log(`Result after transfer fulfil: ${util.inspect(result)}`);

    //     // check we stopped at quoteReceived state
    //     expect(result.currentState).toBe('COMPLETED');
    //     expect(StateMachine.__instance.state).toBe('succeeded');

    // });

    
});
