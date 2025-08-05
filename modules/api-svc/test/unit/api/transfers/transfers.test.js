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
 - Yevhen Kyriukha - <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.unmock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const redis = require('redis');
const uuid = require('@mojaloop/central-services-shared').Util.id;
const {createValidators, createTestServers, destroyTestServers} = require('../utils');
const {createPostTransfersTester, createGetTransfersTester} = require('./utils');

const defaultConfig = require('../../data/defaultConfig');

// Transfers
const postQuotesBody = require('./data/postQuotesBody');
const postTransfersBody = require('./data/postTransfersBody');
const putPartiesBody = require('./data/putPartiesBody');
const putQuotesBody = require('./data/putQuotesBody');
const putTransfersBody = require('./data/putTransfersBody');
const postTransfersBadBody = require('./data/postTransfersBadBody');
const postTransfersSuccessResponse = require('./data/postTransfersSuccessResponse');
const postTransfersErrorTimeoutResponse = require('./data/postTransfersErrorTimeoutResponse');
const postTransfersErrorMojaloopResponse = require('./data/postTransfersErrorMojaloopResponse');
const getTransfersCommittedResponse = require('./data/getTransfersCommittedResponse');
const getTransfersErrorNotFound = require('./data/getTransfersErrorNotFound');

describe('Outbound Transfers API', () => {
    let testPostTransfers;
    let testGetTransfers;
    let validatorsInfo;
    let serversInfo;
    let redisClient;

    beforeAll(async () => {
        validatorsInfo = await createValidators();
        redisClient = redis.createClient({ cacheUrl: 'redis://dummy:1234' });
    });

    afterAll(async () => {
        await redisClient.disconnect();
    });

    beforeEach(async () => {
        serversInfo = await createTestServers({
            ...defaultConfig,
            alsEndpoint: null,
        });
        testPostTransfers = createPostTransfersTester({
            reqInbound: serversInfo.reqInbound,
            reqOutbound: serversInfo.reqOutbound,
            requestValidatorInbound: validatorsInfo.requestValidatorInbound,
            apiSpecsOutbound: validatorsInfo.apiSpecsOutbound,
        });
        testGetTransfers = createGetTransfersTester({
            reqInbound: serversInfo.reqInbound,
            reqOutbound: serversInfo.reqOutbound,
            apiSpecsOutbound: validatorsInfo.apiSpecsOutbound,
        });
    });

    afterEach(async () => {
        await destroyTestServers(serversInfo);
    });

    describe('POST /transfers', () => {
        beforeEach(() => {
            uuid.__reset();
            redisClient.flushdb();
        });

        test(
            'fails validation on invalid request and gives detailed error message indicating source of failure',
            (done) => {
                serversInfo.reqOutbound.post('/transfers').
                    send(postTransfersBadBody).
                    expect(400, {
                        message: 'must be equal to one of the allowed values',
                        statusCode: 400,
                    }).
                    end((err) => {
                        if (err) {
                            return done(err);
                        }
                        return done();
                    });
            });

        test('should return success response', () => {
            const bodyFn = {
                parties: {
                    put: () => putPartiesBody,
                },
                quotes: {
                    post: (body) => ({
                        ...postQuotesBody,
                        expiration: body.expiration,
                    }),
                    put: () => putQuotesBody,
                },
                transfers: {
                    post: (body) => ({
                        ...postTransfersBody,
                        expiration: body.expiration,
                    }),
                    put: () => putTransfersBody,
                },
            };
            return testPostTransfers(bodyFn, 200, postTransfersSuccessResponse);
        });

        test('should return timeout error response on party resolution', () => {
            const putBodyFn = {
                parties: {
                    put: () => new Promise(
                        resolve => setTimeout(() => resolve(putPartiesBody),
                            3000)),
                },
            };
            return testPostTransfers(putBodyFn, 504, postTransfersErrorTimeoutResponse);
        });

        test('should return mojaloop error response on party resolution', () => {
            const putBodyFn = {
                parties: {
                    put: () => ({
                        errorInformation: {
                            errorCode: '3204',
                            errorDescription: 'Party not found',
                        },
                    }),
                },
            };
            return testPostTransfers(putBodyFn, 500, postTransfersErrorMojaloopResponse);
        });
    });


    describe('GET /transfers', () => {
        beforeEach(() => {
            uuid.__reset();
            redisClient.flushdb();
        });

        test('should return COMMITTED transaction state', async () => {
            const bodyFn = {
                parties: {
                    put: () => putPartiesBody,
                },
                quotes: {
                    post: (body) => ({
                        ...postQuotesBody,
                        expiration: body.expiration,
                    }),
                    put: () => putQuotesBody,
                },
                transfers: {
                    post: (body) => ({
                        ...postTransfersBody,
                        expiration: body.expiration,
                    }),
                    put: () => putTransfersBody,
                },
            };
            await testPostTransfers(bodyFn, 200, postTransfersSuccessResponse);

            const putBodyFn = () => putTransfersBody;
            return testGetTransfers(putBodyFn, 200, getTransfersCommittedResponse);
        });

        test('should return transfer not found error', () => {
            const putBodyFn = () => ({
                errorInformation: {
                    errorCode: '3208',
                    errorDescription: 'Transaction not found',
                },
            });
            return testGetTransfers(putBodyFn, 500, getTransfersErrorNotFound);
        });
    });
});
