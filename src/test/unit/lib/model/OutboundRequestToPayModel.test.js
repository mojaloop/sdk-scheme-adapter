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

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const util = require('util');
const Cache = require('@internal/cache');
const Model = require('@internal/model').OutboundRequestToPayModel;
const { Logger, Transports } = require('@internal/log');

const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');
const requestToPayRequest = require('./data/requestToPayRequest');
const payeeParty = require('./data/payeeParty');
const transactionRequestResponseTemplate = require('./data/transactionRequestResponse');

const genPartyId = (party) => {
    const { partyIdType, partyIdentifier, partySubIdOrType } = party.party.partyIdInfo;
    return `${partyIdType}_${partyIdentifier}` + (partySubIdOrType ? `_${partySubIdOrType}` : '');
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
        const logTransports = await Promise.all([Transports.consoleDir()]);
        logger = new Logger({ context: { app: 'outbound-model-unit-tests-cache' }, space: 4, transports: logTransports });
        transactionRequestResponse = JSON.parse(JSON.stringify(transactionRequestResponseTemplate));
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postTransactionRequests = jest.fn(() => Promise.resolve());
        
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
        });

        await model.initialize(JSON.parse(JSON.stringify(requestToPayRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('executes all two stages without halting when AUTO_ACCEPT_PARTY is true', async () => {
        config.autoAcceptParty = true;
        
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

        console.log(`Result after two stage transfer: ${util.inspect(result)}`);

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransactionRequests).toHaveBeenCalledTimes(1);
        
        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(result.transactionRequestResponse.transactionRequestState).toBe('RECEIVED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    
    
});
