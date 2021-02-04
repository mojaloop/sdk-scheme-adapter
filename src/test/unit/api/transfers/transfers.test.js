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
        redisClient = redis.createClient();
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

    afterAll(async () => {
        redisClient.end();
    });

    describe('POST /transfers', () => {
        beforeEach(() => {
            uuidv4.__reset();
            redisClient.flushdb();
        });

        test(
            'fails validation on invalid request and gives detailed error message indicating source of failure',
            (done) => {
                serversInfo.reqOutbound.post('/transfers').
                    send(postTransfersBadBody).
                    expect(400, {
                        message: '.body.to.idType should be equal to one of the allowed values',
                        statusCode: 400,
                    }).
                    end(done);
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
                            2000)),
                },
            };
            return testPostTransfers(putBodyFn, 504,
                postTransfersErrorTimeoutResponse);
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
            return testPostTransfers(putBodyFn, 500,
                postTransfersErrorMojaloopResponse);
        });
    });


    describe('GET /transfers', () => {
        beforeEach(() => {
            uuidv4.__reset();
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
