/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Steven Oderayi - steven.oderayi@modusbox.com                     *
 **************************************************************************/

'use strict';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const Cache = require('@internal/cache');
const Model = require('@internal/model').OutboundBulkQuotesModel;

const { MojaloopRequests, Logger } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');
const bulkQuoteRequest = require('./data/bulkQuoteRequest');
const bulkQuoteResponseTemplate = require('./data/bulkQuoteResponse');

// util function to simulate a quote response subscription message on a cache client
const emitBulkQuoteResponseCacheMessage = (cache, bulkQuoteId, bulkQuoteResponse) => {
    cache.publish(`bulkQuote_${bulkQuoteId}`, JSON.stringify(bulkQuoteResponse));
};

describe('OutboundBulkQuotesModel', () => {
    let bulkQuoteResponse;
    let config;
    let logger;
    let cache;

    /**
     *
     * @param {Object} opts
     * @param {Number} opts.expirySeconds
     * @param {Object} opts.delays
     * @param {Number} delays.requestBulkQuotes
     * @param {Object} opts.rejects
     * @param {boolean} rejects.bulkQuoteResponse
     */
    async function testBulkQuoteWithDelay({expirySeconds, delays, rejects}) {
        const config = JSON.parse(JSON.stringify(defaultConfig));
        config.expirySeconds = expirySeconds;
        config.rejectExpiredQuoteResponses = rejects.bulkQuoteResponse;

        // simulate a delayed callback with the bulk quote response
        MojaloopRequests.__postBulkQuotes = jest.fn((postBulkQuotesBody) => {
            setTimeout(() => {
                emitBulkQuoteResponseCacheMessage(cache, postBulkQuotesBody.bulkQuoteId, bulkQuoteResponse);
            }, delays.requestBulkQuotes ? delays.requestBulkQuotes * 1000 : 0);
        });

        const model = new Model({
            ...config,
            cache,
            logger,
            tls: config.outbound.tls,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        let expectError;

        if (rejects.bulkQuoteResponse && delays.requestBulkQuotes && expirySeconds < delays.requestBulkQuotes) {
            expectError = 'Bulk quote response missed expiry deadline';
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
        bulkQuoteResponse = JSON.parse(JSON.stringify(bulkQuoteResponseTemplate));
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));

        MojaloopRequests.__postBulkQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putBulkQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putBulkQuotesError = jest.fn(() => Promise.resolve());

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

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });

    test('test get bulk quote', async () => {
        MojaloopRequests.__getBulkQuotes = jest.fn((bulkQuoteId) => {
            emitBulkQuoteResponseCacheMessage(cache, bulkQuoteId, bulkQuoteResponse);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
            tls: config.outbound.tls,
        });

        const BULK_QUOTE_ID = 'bq-id000011';

        await model.initialize(JSON.parse(JSON.stringify({
            currentState: 'getBulkQuote',
            bulkQuoteId: BULK_QUOTE_ID,
        })));

        expect(StateMachine.__instance.state).toBe('getBulkQuote');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getBulkQuotes).toHaveBeenCalledTimes(1);

        // check we stopped at succeeded state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('sends bulk quotes request with correct payload', async () => {
        MojaloopRequests.__postBulkQuotes = jest.fn((postBulkQuotesBody) => {
            // ensure that the `MojaloopRequests.postBulkQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postBulkQuotesBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the bulk quote response
            emitBulkQuoteResponseCacheMessage(cache, postBulkQuotesBody.bulkQuoteId, bulkQuoteResponse);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
            tls: config.outbound.tls,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postBulkQuotes).toHaveBeenCalledTimes(1);

        // check we stopped at 'succeeded' state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('pass quote response `expiration` deadline', () =>
        testBulkQuoteWithDelay({
            expirySeconds: 2,
            delays: {
                requestBulkQuotes: 1,
            },
            rejects: {
                bulkQuoteResponse: true,
            }
        })
    );

    test('fail on quote response `expiration` deadline', () =>
        testBulkQuoteWithDelay({
            expirySeconds: 1,
            delays: {
                requestBulkQuotes: 2,
            },
            rejects: {
                bulkQuoteResponse: true,
            }
        })
    );

    test('Throws with mojaloop error in response body when quote request error callback occurs', async () => {
        const expectError = {
            type: 'bulkQuoteResponseError',
            data: {
                errorInformation: {
                    errorCode: '3205',
                    errorDescription: 'Bulk quote ID not found'
                }
            }
        };

        MojaloopRequests.__postBulkQuotes = jest.fn((postBulkQuotesBody) => {
            // simulate a callback with the bulk quote response
            cache.publish(`bulkQuote_${postBulkQuotesBody.bulkQuoteId}`, JSON.stringify(expectError));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
            tls: config.outbound.tls,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const errMsg = 'Got an error response requesting bulk quote: { errorInformation:\n   { errorCode: \'3205\', errorDescription: \'Bulk quote ID not found\' } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.bulkQuoteState).toBeTruthy();
            expect(err.bulkQuoteState.lastError).toBeTruthy();
            expect(err.bulkQuoteState.lastError.mojaloopError).toEqual(expectError.data);
            expect(err.bulkQuoteState.lastError.bulkQuoteState).toBe(undefined);
            return;
        }

        throw new Error('Outbound bulk quotes model should have thrown');
    });
});
