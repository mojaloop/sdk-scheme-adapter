
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

 * Infitx
 - Steven Oderayi <steven.oderayi@infitx.com>

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
const { logger } = require('~/lib/logger');
const Cache = require('~/lib/cache');
const Model = require('~/lib/model').OutboundBulkQuotesModel;

const { SDKStateEnum } = require('../../../../src/lib/model/common');

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
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        let expectError;

        if (rejects.bulkQuoteResponse && delays.requestBulkQuotes && expirySeconds < delays.requestBulkQuotes) {
            expectError = 'Bulk quote response missed expiry deadline';
        }

        if (expectError) {
            await expect(model.run()).rejects.toThrow(expectError);
        } else {
            const result = await model.run();
            await expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        }
    }

    beforeAll(async () => {
        bulkQuoteResponse = JSON.parse(JSON.stringify(bulkQuoteResponseTemplate));
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));

        MojaloopRequests.__postBulkQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putBulkQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putBulkQuotesError = jest.fn(() => Promise.resolve());

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
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
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
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postBulkQuotes).toHaveBeenCalledTimes(1);

        // check we stopped at 'succeeded' state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
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
                body: {
                    errorInformation: {
                        errorCode: '3205',
                        errorDescription: 'Bulk quote ID not found'
                    }
                },
                headers: {}
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
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkQuoteRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const errMsg = 'Got an error response requesting bulk quote: {"errorInformation":{"errorCode":"3205","errorDescription":"Bulk quote ID not found"}}';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.bulkQuoteState).toBeTruthy();
            // TODO: Need to check the lastError functionality in response handling. Commenting until then.
            // expect(err.bulkQuoteState.lastError).toBeTruthy();
            // expect(err.bulkQuoteState.lastError.mojaloopError).toEqual(expectError.data.body);
            // expect(err.bulkQuoteState.lastError.bulkQuoteState).toBe(undefined);
            return;
        }

        throw new Error('Outbound bulk quotes model should have thrown');
    });
});
