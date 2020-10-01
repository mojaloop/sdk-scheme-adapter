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
const WebSocket = require('ws');
const { Logger } = require('@mojaloop/sdk-standard-components');

const Cache = require('@internal/cache');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const InboundServer = require('../../InboundServer');
const TestServer = require('../../TestServer');

const createWsClient = async (port, path) => {
    const result = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
        result.on('open', resolve);
        result.on('error', reject);
    });
    return result;
};

describe('Test Server', () => {
    let testServer, inboundServer, inboundReq, testReq, serverConfig, wsClients, testServerPort,
        logger, cache;

    beforeEach(async () => {
        Cache.mockClear();

        logger = new Logger.Logger();

        serverConfig = {
            ...JSON.parse(JSON.stringify(defaultConfig)),
            enableTestFeatures: true,
        };
        cache = new Cache({ ...serverConfig.cacheConfig, logger: logger.push({ component: 'cache' }) });

        testServer = new TestServer({ tls: serverConfig.tls.test, logger, cache });
        await testServer.start();
        testServerPort = testServer._server.address().port;

        expect(testServer._server.listening).toBe(true);
        testReq = supertest.agent(testServer._server);

        inboundServer = new InboundServer(serverConfig, logger, cache);
        await inboundServer.start();
        inboundReq = supertest(inboundServer._server);

        wsClients = {
            root: await createWsClient(testServerPort, '/'),
            callbacks: await createWsClient(testServerPort, '/callbacks'),
            requests: await createWsClient(testServerPort, '/requests'),
        };

        expect(Object.values(wsClients).every((cli) => cli.readyState === WebSocket.OPEN)).toBe(true);
        expect(testServer._wsapi._wsClients.size).toBeGreaterThan(0);

        expect(Cache).toHaveBeenCalledTimes(1);
    });

    afterEach(async () => {
        await Promise.all(Object.values(wsClients).map((cli) => {
            cli.close();
            return new Promise((resolve) => cli.on('close', resolve));
        }));
        await testServer.stop();
        await inboundServer.stop();
    });

    // TODO: check this happens correctly with top-level server if possible?
    test('Inbound server and Test server construct cache with same parameters when provided same config', async () => {
        expect(Cache).toHaveBeenCalledTimes(1);
        const testArgs = { ...Cache.mock.calls[0][0], logger: expect.anything() };
        expect(Cache).toHaveBeenNthCalledWith(1, testArgs);
    });

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

        expect(cache.set.mock.calls[0][0]).toEqual(cache.get.mock.calls[0][0]);
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

        expect(cache.set.mock.calls[0][0]).toEqual(cache.get.mock.calls[0][0]);
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

        expect(cache.set.mock.calls[0][0]).toEqual(cache.get.mock.calls[0][0]);
    });

    test('Subscribes to the keyevent set notification', async () => {
        expect(testServer._wsapi._cache.subscribe).toBeCalledTimes(1);
        expect(testServer._wsapi._cache.subscribe).toHaveBeenCalledWith(
            testServer._wsapi._cache.EVENT_SET,
            expect.any(Function),
        );
    });

    test('Configures cache correctly', async () => {
        expect(testServer._wsapi._cache.setTestMode).toBeCalledTimes(1);
        expect(testServer._wsapi._cache.setTestMode).toHaveBeenCalledWith(true);
    });

    test('WebSocket /callbacks and / endpoint triggers send to client when callback received to inbound server', async () => {
        const participantId = '00000000-0000-1000-a000-000000000002';

        const headers = {
            ...commonHttpHeaders,
            'fspiop-http-method': 'PUT',
            'fspiop-uri': `/participants/${participantId}`,
            'date': new Date().toISOString(),
        };

        const putParticipantWsClient = await createWsClient(
            testServerPort,
            `/callbacks/${participantId}`
        );

        const putParticipantEndpointMessageReceived = new Promise(resolve => {
            putParticipantWsClient.on('message', resolve);
        });
        const serverCallbackEndpointMessageReceived = new Promise(resolve => {
            wsClients.callbacks.on('message', resolve);
        });
        const serverRootEndpointMessageReceived = new Promise(resolve => {
            wsClients.root.on('message', resolve);
        });

        // get the callback function that the test server subscribed with, and mock the cache by
        // calling the callback when the inbound server sets a key in the cache.
        const callback = testServer._wsapi._cache.subscribe.mock.calls[0][1];
        inboundServer._api._cache.set = jest.fn(async (key) => await callback(
            inboundServer._api._cache.EVENT_SET,
            key,
            1,
        ));
        testServer._wsapi._cache.get = jest.fn(() => ({
            data: putParticipantsBody,
            headers,
        }));

        await inboundReq
            .put(`/participants/${participantId}`)
            .send(putParticipantsBody)
            .set(headers);

        expect(inboundServer._api._cache.set).toHaveBeenCalledTimes(1);
        expect(inboundServer._api._cache.set).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.CALLBACK_PREFIX}${participantId}`,
            {
                data: putParticipantsBody,
                headers: expect.objectContaining(headers),
            }
        );

        expect(testServer._wsapi._cache.get).toHaveBeenCalledTimes(1);
        expect(testServer._wsapi._cache.get).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.CALLBACK_PREFIX}${participantId}`
        );

        const expectedMessage = {
            data: putParticipantsBody,
            headers: expect.objectContaining(headers),
            id: participantId
        };

        // Expect the client websockets to receive a message containing the callback headers and
        // body
        const callbackClientResult = JSON.parse(await serverCallbackEndpointMessageReceived);
        expect(callbackClientResult).toEqual(expectedMessage);
        const rootClientResult = JSON.parse(await serverRootEndpointMessageReceived);
        expect(rootClientResult).toEqual(expectedMessage);
        const putParticipantClientClientResult = JSON.parse(await putParticipantEndpointMessageReceived);
        expect(putParticipantClientClientResult).toEqual(expectedMessage);
    });

    test('WebSocket /requests and / endpoint triggers send to client when callback received to inbound server', async () => {
        const headers = {
            ...commonHttpHeaders,
            'fspiop-http-method': 'POST',
            'fspiop-uri': '/quotes',
            'date': new Date().toISOString(),
        };

        const postQuoteWsClient = await createWsClient(
            testServerPort,
            `/requests/${postQuotesBody.quoteId}`
        );

        const postQuoteEndpointMessageReceived = new Promise(resolve => {
            postQuoteWsClient.on('message', resolve);
        });
        const serverRequestEndpointMessageReceived = new Promise(resolve => {
            wsClients.requests.on('message', resolve);
        });
        const serverRootEndpointMessageReceived = new Promise(resolve => {
            wsClients.root.on('message', resolve);
        });

        // get the callback function that the test server subscribed with, and mock the cache by
        // calling the callback when the inbound server sets a key in the cache.
        const callback = testServer._wsapi._cache.subscribe.mock.calls[0][1];
        inboundServer._api._cache.set = jest.fn(async (key) => await callback(
            inboundServer._api._cache.EVENT_SET,
            key,
            1,
        ));
        testServer._wsapi._cache.get = jest.fn(() => ({
            data: postQuotesBody,
            headers,
        }));

        await inboundReq
            .post('/quotes')
            .send(postQuotesBody)
            .set(headers);

        // Called once for the quote request, once for the fulfilment
        expect(inboundServer._api._cache.set).toHaveBeenCalledTimes(2);
        expect(inboundServer._api._cache.set).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.REQUEST_PREFIX}${postQuotesBody.quoteId}`,
            {
                data: postQuotesBody,
                headers: expect.objectContaining(headers),
            }
        );

        expect(testServer._wsapi._cache.get).toHaveBeenCalledTimes(1);
        expect(testServer._wsapi._cache.get).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.REQUEST_PREFIX}${postQuotesBody.quoteId}`
        );

        const expectedMessage = {
            data: postQuotesBody,
            headers: expect.objectContaining(headers),
            id: postQuotesBody.quoteId,
        };

        // Expect the client websockets to receive a message containing the callback headers and
        // body
        const callbackClientResult = JSON.parse(await serverRequestEndpointMessageReceived);
        expect(callbackClientResult).toEqual(expectedMessage);
        const rootClientResult = JSON.parse(await serverRootEndpointMessageReceived);
        expect(rootClientResult).toEqual(expectedMessage);
        const postQuoteClientResult = JSON.parse(await postQuoteEndpointMessageReceived);
        expect(postQuoteClientResult).toEqual(expectedMessage);
    });

    test('Websocket / endpoint receives both callbacks and requests', async () => {
        const quoteRequestHeaders = {
            ...commonHttpHeaders,
            'fspiop-http-method': 'POST',
            'fspiop-uri': '/quotes',
            'date': new Date().toISOString(),
        };

        const serverRootEndpointMessageReceived = new Promise(resolve => {
            wsClients.root.on('message', resolve);
        });

        // get the callback function that the test server subscribed with, and mock the cache by
        // calling the callback when the inbound server sets a key in the cache.
        const callback = testServer._wsapi._cache.subscribe.mock.calls[0][1];
        inboundServer._api._cache.set = jest.fn(async (key) => await callback(
            inboundServer._api._cache.EVENT_SET,
            key,
            1,
        ));
        testServer._wsapi._cache.get = jest.fn(() => ({
            data: postQuotesBody,
            headers: quoteRequestHeaders,
        }));

        await inboundReq
            .post('/quotes')
            .send(postQuotesBody)
            .set(quoteRequestHeaders);

        // Called once for the quote request, once for the fulfilment
        expect(inboundServer._api._cache.set).toHaveBeenCalledTimes(2);
        expect(inboundServer._api._cache.set).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.REQUEST_PREFIX}${postQuotesBody.quoteId}`,
            {
                data: postQuotesBody,
                headers: expect.objectContaining(quoteRequestHeaders),
            }
        );

        expect(testServer._wsapi._cache.get).toHaveBeenCalledTimes(1);
        expect(testServer._wsapi._cache.get).toHaveBeenCalledWith(
            `${testServer._wsapi._cache.REQUEST_PREFIX}${postQuotesBody.quoteId}`
        );

        const expectedMessage = {
            data: postQuotesBody,
            headers: expect.objectContaining(quoteRequestHeaders),
            id: postQuotesBody.quoteId,
        };

        // Expect the client websockets to receive a message containing the callback
        // quoteRequestHeaders and body
        const rootEndpointResult = JSON.parse(await serverRootEndpointMessageReceived);
        expect(rootEndpointResult).toEqual(expectedMessage);

        const participantId = '00000000-0000-1000-a000-000000000002';

        const putParticipantsHeaders = {
            ...commonHttpHeaders,
            'fspiop-http-method': 'PUT',
            'fspiop-uri': `/participants/${participantId}`,
            'date': new Date().toISOString(),
        };

        await inboundReq
            .put(`/participants/${participantId}`)
            .send(putParticipantsBody)
            .set(putParticipantsHeaders);

        // Called twice for the quote request earlier in this test, another time now for the put
        // participants request
        expect(inboundServer._api._cache.set).toHaveBeenCalledTimes(3);
        expect(inboundServer._api._cache.set.mock.calls[2]).toEqual([
            `${testServer._wsapi._cache.CALLBACK_PREFIX}${participantId}`,
            {
                data: putParticipantsBody,
                headers: expect.objectContaining(putParticipantsHeaders),
            }
        ]);

        // Called once for the quote request earlier in this test, another time now for the
        // participants callback
        expect(testServer._wsapi._cache.get).toHaveBeenCalledTimes(2);
        expect(testServer._wsapi._cache.get.mock.calls[1]).toEqual([
            `${testServer._wsapi._cache.CALLBACK_PREFIX}${participantId}`
        ]);
    });
});
