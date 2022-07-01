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

jest.unmock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const redis = require('redis');
const uuidv4 = require('uuidv4');
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
        // redisClient.end();
    });

    describe('POST /accounts', () => {
        beforeEach(() => {
            uuidv4.__reset();
            redisClient.flushdb();
        });

        test('should return success response', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: body.currency,
            });
            return testPostAccounts(putBodyFn, 200,
                postAccountsSuccessResponse);
        });

        test(
            'should return success response with error info on invalid currency (1)',
            () => {
                const putBodyFn = (body) => ({
                    partyList: body.partyList.map(party => ({
                        partyId: party,
                    })),
                    currency: undefined,
                });
                return testPostAccounts(putBodyFn, 200,
                    postAccountsSuccessResponseWithError1);
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
