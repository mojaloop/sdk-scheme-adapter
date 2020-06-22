/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const util = require('util');
const Cache = require('@internal/cache');
const Model = require('@internal/model').OutboundAuthorizationsModel;
const { Logger, Transports } = require('@internal/log');

const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');

// util function to simulate a party resolution subscription message on a cache client
const emitPartyCacheMessage = (cache, party) => cache.publish(genPartyId(party), JSON.stringify(party));

// util function to simulate a quote response subscription message on a cache client
const emitTransactionRequestResponseCacheMessage = (cache, transactionRequestId, transactionRequestResponse) => cache.publish(`txnreq_${transactionRequestId}`, JSON.stringify(transactionRequestResponse));

describe('authorizationsModel', () => {
    let transactionRequestResponse;
    let config;
    let logger;
    let cache;
    let cacheKey;
    let data;
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
        // transactionRequestResponse = JSON.parse(JSON.stringify(transactionRequestResponseTemplate));
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

        data = {the: 'mocked data'};
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('initializes to starting state', async () => {
        const modelConfig = {
            cache,
            logger,
            ...config,
        };
        const model = await Model.create(data, cacheKey, modelConfig);

        expect(model.state).toBe('start');
    });

});