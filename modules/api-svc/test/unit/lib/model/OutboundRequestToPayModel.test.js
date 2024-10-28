/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Murthy Kakarlamudi - murthy@modusbox.com                             *
 **************************************************************************/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const Cache = require('~/lib/cache');
const Model = require('~/lib/model').OutboundRequestToPayModel;
const PartiesModel = require('~/lib/model').PartiesModel;

const { MojaloopRequests, Logger } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');
const { SDKStateEnum } = require('../../../../src/lib/model/common');

const defaultConfig = require('./data/defaultConfig');
const requestToPayRequest = require('./data/requestToPayRequest');
const payeeParty = require('./data/payeeParty');
const transactionRequestResponseTemplate = require('./data/transactionRequestResponse');

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

// util function to simulate a quote response subscription message on a cache client
const emitTransactionRequestResponseCacheMessage = (cache, transactionRequestId, transactionRequestResponse) => cache.publish(`txnreq_${transactionRequestId}`, JSON.stringify(transactionRequestResponse));

describe('outboundModel', () => {
    let transactionRequestResponse;
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
        logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
        transactionRequestResponse = JSON.parse(JSON.stringify(transactionRequestResponseTemplate));
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postTransactionRequests = jest.fn(() => Promise.resolve());

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

        await model.initialize(JSON.parse(JSON.stringify(requestToPayRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('executes all two stages without halting when AUTO_ACCEPT_R2P_PARTY is true', async () => {
        config.autoAcceptR2PParty = true;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransactionRequests = jest.fn((postTransactionRequestsBody) => {
            // simulate a callback with the quote response
            emitTransactionRequestResponseCacheMessage(cache, postTransactionRequestsBody.transactionRequestId, transactionRequestResponse);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransactionRequests).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result.transactionRequestResponse.transactionRequestState).toBe('RECEIVED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('resolves payee and halts when AUTO_ACCEPT_R2P_PARTY is false', async () => {
        config.autoAcceptR2PParty = false;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayRequest)));

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

    test('resolves payee and halts when AUTO_ACCEPT_R2P_PARTY is false and continue after party acceptance', async () => {
        config.autoAcceptR2PParty = false;

        MojaloopRequests.__getParties = jest.fn(() => {
            emitPartyCacheMessage(cache, payeeParty);
            return Promise.resolve();
        });

        MojaloopRequests.__postTransactionRequests = jest.fn((postTransactionRequestsBody) => {
            // simulate a callback with the quote response
            emitTransactionRequestResponseCacheMessage(cache, postTransactionRequestsBody.transactionRequestId, transactionRequestResponse);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransactionRequests).toHaveBeenCalledTimes(0);
        expect(result.currentState).toBe(SDKStateEnum.WAITING_FOR_PARTY_ACCEPTANCE);
        expect(result.transactionRequestResponse).toBe(undefined);
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // start the model running
        const result2 = await model.run();
        expect(MojaloopRequests.__postTransactionRequests).toHaveBeenCalledTimes(1);
        expect(result2.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(result2.transactionRequestResponse.transactionRequestState).toBe('RECEIVED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

});
