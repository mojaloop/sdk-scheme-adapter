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
const {createPostAccountsTester, createDeleteAccountTester} = require('./utils');

const defaultConfig = require('../../data/defaultConfig');

// Accounts
const postAccountsSuccessResponse = require('./data/postAccountsSuccessResponse');
const postAccountsSuccessResponseWithError1 = require('./data/postAccountsSuccessResponseWithError1');
const postAccountsSuccessResponseWithError2 = require('./data/postAccountsSuccessResponseWithError2');
const postAccountsErrorTimeoutResponse = require('./data/postAccountsErrorTimeoutResponse');
const postAccountsErrorMojaloopResponse = require('./data/postAccountsErrorMojaloopResponse');
const deleteAccountSuccessResponse = require('./data/deleteAccountSuccessResponse');

describe('Outbound Accounts API', () => {
    let testPostAccounts;
    let testDeleteAccount;
    let validatorsInfo;
    let serversInfo;
    let redisClient;

    beforeAll(async () => {
        validatorsInfo = await createValidators();
        redisClient = redis.createClient(defaultConfig);
    });

    beforeEach(async () => {
        serversInfo = await createTestServers(defaultConfig);
        testPostAccounts = createPostAccountsTester({
            reqInbound: serversInfo.reqInbound,
            reqOutbound: serversInfo.reqOutbound,
            apiSpecsOutbound: validatorsInfo.apiSpecsOutbound,
        });
    });

    afterEach(async () => {
        await destroyTestServers(serversInfo);
    });

    afterAll(async () => {
        await redisClient.disconnect();
    });

    describe('POST /accounts', () => {
        beforeEach(() => {
            uuid.__reset();
            redisClient.flushdb();
        });

        test('should return success response', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: body.currency,
            });
            return testPostAccounts(putBodyFn, 200, postAccountsSuccessResponse);
        });

        test('should return success response with error info on invalid currency (1)', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: undefined,
            });
            return testPostAccounts(putBodyFn, 200, postAccountsSuccessResponseWithError1);
        });

        test(
            'should return success response with error info on errorInformation presence (2)',
            () => {
                const putBodyFn = (body) => ({
                    partyList: body.partyList.map(party => ({
                        partyId: party,
                        errorInformation: {
                            errorCode: '3204',
                            errorDescription: 'Party not found',
                        },
                    })),
                    currency: 'USD',
                });
                return testPostAccounts(putBodyFn, 200,
                    postAccountsSuccessResponseWithError2);
            });

        test('should return timeout error response', () => {
            const putBodyFn = (body) => new Promise(
                resolve => setTimeout(() => resolve({
                    partyList: body.partyList.map(party => ({
                        partyId: party,
                    })),
                    currency: body.currency,
                }), 3000));
            return testPostAccounts(putBodyFn, 504,
                postAccountsErrorTimeoutResponse);
        });

        // PUT /participants/{ID}/error needs to be higher in api.yaml
        // than PUT /participants/{Type}/{ID}. Not sure why that is the case
        // in the test harness atm.
        test('should return mojaloop error response', () => {
            const putBodyFn = () => ({
                errorInformation: {
                    errorCode: '3204',
                    errorDescription: 'Party not found',
                },
            });
            return testPostAccounts(putBodyFn, 500,
                postAccountsErrorMojaloopResponse);
        });
    });

    describe('DELETE /accounts/{Type}/{ID}/{SubId}', () => {
        const reqParams = {
            Type: 'MSISDN',
            ID: '123456789'
        }
        beforeEach(() => {
            uuid.__reset();
            redisClient.flushdb();
            testDeleteAccount = createDeleteAccountTester({
                reqInbound: serversInfo.reqInbound,
                reqOutbound: serversInfo.reqOutbound,
                reqParams,
                apiSpecsOutbound: validatorsInfo.apiSpecsOutbound,
            });
        });

        test('should return success response', () => {
            const putBodyFn = (body) => ({
                fspId: 'mojaloop-sdk',
            });
            return testDeleteAccount(putBodyFn, 200, deleteAccountSuccessResponse);
        });
    });
});
