/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const supertest = require('supertest');

const defaultConfig = require('./data/defaultConfig');
const putPartiesBody = require('./data/putPartiesBody');
const postQuotesBody = require('./data/postQuotesBody');
const putParticipantsBody = require('./data/putParticipantsBody');
const commonHttpHeaders = require('./data/commonHttpHeaders');

const cache = require('@internal/cache');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const InboundServer = require('../../InboundServer');
const TestServer = require('../../TestServer');

// - testserver health check- remember, k8s will kill the pod if this fails
// - testserver starts- I guess
// - testserver asks the cache for the same key inboundserver stores on
// - testserver callbacks _and_ requests

describe('Test Server', () => {
    let testServer, inboundServer, inboundReq, testReq, serverConfig, inboundCache, testCache;

    beforeEach(async () => {
        cache.mockClear();

        serverConfig = {
            ...JSON.parse(JSON.stringify(defaultConfig)),
            enableTestFeatures: true,
            logger: {
                indent: 2,
                transports: {
                    stdout: true
                }
            }
        };

        testServer = new TestServer(serverConfig);
        testReq = supertest(await testServer.setupApi());
        await testServer.start();
        testCache = cache.mock.instances[0];

        inboundServer = new InboundServer(serverConfig);
        inboundReq = supertest(await inboundServer.setupApi());
        await inboundServer.start();
        inboundCache = cache.mock.instances[1];

        expect(cache).toHaveBeenCalledTimes(2);
    });

    afterEach(async () => {
        await testServer.stop();
        await inboundServer.stop();
    });

    // TODO: check this happens correctly with top-level server if possible?
    test('Inbound server and Test server construct cache with same parameters when provided same config', async () => {
        expect(cache).toHaveBeenCalledTimes(2);
        const testArgs = { ...cache.mock.calls[0][0], logger: expect.anything() };
        expect(cache).toHaveBeenNthCalledWith(2, testArgs);
    });

    // test('Inbound server and Test server construct cache with same parameters', async () => {
    //     const 
    // });

    test('Health check', async () => {
        const result = await testReq.get('/');
        expect(result.ok).toBeTruthy();
        expect(result.statusCode).toEqual(204);
    });

    test('PUT /parties cache get and set use same value', async () => {
        const MSISDN = '123456789';

        await inboundReq
            .put(`/parties/MSISDN/${MSISDN}`)
            .send(putPartiesBody)
            .set(commonHttpHeaders)
            .set('fspiop-http-method', 'PUT')
            .set('fspiop-uri', `/parties/MSISDN/${MSISDN}`)
            .set('date', new Date().toISOString());

        await testReq.get(`/callbacks/${MSISDN}`);

        expect(inboundCache.set.mock.calls[0][0]).toEqual(testCache.get.mock.calls[0][0]);
    });

    test('POST /quotes requests cache get and set use same value', async () => {
        await inboundReq
            .post('/quotes')
            .send(postQuotesBody)
            .set(commonHttpHeaders)
            .set('fspiop-http-method', 'POST')
            .set('fspiop-uri', '/quotes')
            .set('date', new Date().toISOString());

        await testReq.get(`/requests/${postQuotesBody.quoteId}`);

        expect(inboundCache.set.mock.calls[0][0]).toEqual(testCache.get.mock.calls[0][0]);
    });

    test('PUT /participants callbacks cache get and set use same value', async () => {
        const participantId = '00000000-0000-1000-a000-000000000002';

        await inboundReq
            .put(`/participants/${participantId}`)
            .send(putParticipantsBody)
            .set(commonHttpHeaders)
            .set('fspiop-http-method', 'PUT')
            .set('fspiop-uri', `/participants/${participantId}`)
            .set('date', new Date().toISOString());

        await testReq.get(`/callbacks/${participantId}`);

        expect(inboundCache.set.mock.calls[0][0]).toEqual(testCache.get.mock.calls[0][0]);
    });
});
