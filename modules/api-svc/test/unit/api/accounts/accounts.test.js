/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

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
const {createPostAccountsTester} = require('./utils');

const defaultConfig = require('../../data/defaultConfig');

// Accounts
const postAccountsSuccessResponse = require('./data/postAccountsSuccessResponse');
const postAccountsSuccessResponseWithError1 = require('./data/postAccountsSuccessResponseWithError1');
const postAccountsSuccessResponseWithError2 = require('./data/postAccountsSuccessResponseWithError2');
const postAccountsErrorTimeoutResponse = require('./data/postAccountsErrorTimeoutResponse');
const postAccountsErrorMojaloopResponse = require('./data/postAccountsErrorMojaloopResponse');

describe('Outbound Accounts API', () => {
    let testPostAccounts;
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
});
