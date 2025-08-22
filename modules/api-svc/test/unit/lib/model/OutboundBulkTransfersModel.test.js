
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

const Cache = require('~/lib/cache');
const Model = require('~/lib/model').OutboundBulkTransfersModel;

const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { logger } = require('~/lib/logger');
const { SDKStateEnum } = require('../../../../src/lib/model/common');

const defaultConfig = require('./data/defaultConfig');
const bulkTransferRequest = require('./data/bulkTransferRequest');
const bulkTransferFulfil = require('./data/bulkTransferFulfil');

// util function to simulate a bulk transfer fulfilment subscription message on a cache client
const emitBulkTransferFulfilCacheMessage = (cache, bulkTransferId, fulfils) => cache.publish(`bulkTransfer_${bulkTransferId}`, JSON.stringify(fulfils));

describe('outboundBulkTransferModel', () => {
    let config;
    let cache;

    /**
     *
     * @param {Object} opts
     * @param {Number} opts.expirySeconds
     * @param {Object} opts.delays
     * @param {Number} delays.prepareTransfer
     * @param {Object} opts.rejects
     * @param {boolean} rejects.transferFulfils
     */
    async function testBulkTransferWithDelay({expirySeconds, delays, rejects}) {
        const config = JSON.parse(JSON.stringify(defaultConfig));
        config.expirySeconds = expirySeconds;
        config.rejectExpiredTransferFulfils = rejects.transferFulfils;

        // simulate a delayed callback with the bulk transfer fulfilments
        MojaloopRequests.__postBulkTransfers = jest.fn((postBulkTransfersBody) => {
            setTimeout(() => {
                emitBulkTransferFulfilCacheMessage(cache, postBulkTransfersBody.bulkTransferId, bulkTransferFulfil);
            }, delays.prepareTransfer ? delays.prepareTransfer * 1000 : 0);
        });

        const model = new Model({
            ...config,
            cache,
            logger,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkTransferRequest)));

        let expectError;

        if (rejects.transferFulfils && delays.prepareTransfer && expirySeconds < delays.prepareTransfer) {
            expectError = 'Bulk transfer fulfils missed expiry deadline';
        }
        if (expectError) {
            await expect(model.run()).rejects.toThrow(expectError);
        } else {
            const result = await model.run();
            await expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        }
    }

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        MojaloopRequests.__postBulkTransfers = jest.fn(() => Promise.resolve());

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

        await model.initialize(JSON.parse(JSON.stringify(bulkTransferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('executes bulk transfer', async () => {
        MojaloopRequests.__postBulkTransfers = jest.fn((postBulkTransfersBody) => {
            //ensure that the `MojaloopRequests.postBulkTransfers` method has been called with the correct arguments
            // set as the destination FSPID
            const extensionList = postBulkTransfersBody.extensionList.extension;
            expect(extensionList).toBeTruthy();
            expect(extensionList.length).toBe(2);
            expect(extensionList[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            // simulate a callback with the transfer fulfilment
            emitBulkTransferFulfilCacheMessage(cache, postBulkTransfersBody.bulkTransferId, bulkTransferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkTransferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__postBulkTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at succeeded state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('test get bulk transfer', async () => {
        MojaloopRequests.__getBulkTransfers = jest.fn((bulkTransferId) => {
            emitBulkTransferFulfilCacheMessage(cache, bulkTransferId, bulkTransferFulfil);
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        const BULK_TRANSFER_ID = 'btx-id000011';

        await model.initialize(JSON.parse(JSON.stringify({
            ...bulkTransferRequest,
            currentState: 'getBulkTransfer',
            bulkTransferId: BULK_TRANSFER_ID,
        })));

        expect(StateMachine.__instance.state).toBe('getBulkTransfer');

        // start the model running
        const result = await model.run();

        expect(MojaloopRequests.__getBulkTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at succeeded state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('pass transfer fulfills `expiration` deadline', () =>
        testBulkTransferWithDelay({
            expirySeconds: 2,
            delays: {
                prepareTransfer: 1,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );

    test('fail on transfer fulfills `expiration` deadline', () =>
        testBulkTransferWithDelay({
            expirySeconds: 1,
            delays: {
                prepareTransfer: 2,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );


    test('Throws with mojaloop error in response body when transfer request error callback occurs', async () => {
        const expectError = {
            type: 'bulkTransferResponseError',
            data: {
                body: {
                    errorInformation: {
                        errorCode: '4001',
                        errorDescription: 'Payer FSP insufficient liquidity'
                    }
                },
                headers: {}
            }
        };

        MojaloopRequests.__postBulkTransfers = jest.fn((postBulkTransfersBody) => {
            // simulate an error callback with the transfer fulfilments
            cache.publish(`bulkTransfer_${postBulkTransfersBody.bulkTransferId}`, JSON.stringify(expectError));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(bulkTransferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const errMsg = 'Got an error response preparing bulk transfer: {"errorInformation":{"errorCode":"4001","errorDescription":"Payer FSP insufficient liquidity"}}';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.bulkTransferState).toBeTruthy();
            // TODO: Need to check the lastError functionality in response handling. Commenting until then.
            // expect(err.bulkTransferState.lastError).toBeTruthy();
            // expect(err.bulkTransferState.lastError.mojaloopError).toEqual(expectError.data.body);
            // expect(err.bulkTransferState.lastError.bulkTransferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });
});
