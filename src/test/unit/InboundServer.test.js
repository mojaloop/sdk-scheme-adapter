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

const util = require('util');
const DummyRequest = require('./dummyRequest.js');

const defaultConfig = require('./data/defaultConfig');
const putPartiesBody = require('./data/putPartiesBody');
const postQuotesBody = require('./data/postQuotesBody');
const putParticipantsBody = require('./data/putParticipantsBody');
const partiesRequestTemplate = require('./data/partiesRequestTemplate');
const participantsRequestTemplate = require('./data/participantsRequestTemplate');

// we use a mock koa (from our __mocks__ directory)
jest.mock('koa');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const { Jws } = require('@mojaloop/sdk-standard-components');
const Koa = require('koa');
const http = require('http');
const https = require('https');

const InboundServer = require('../../InboundServer');



async function testInboundJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls, request) {
    const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

    // set all jws validation ON
    dummyConfig.validateInboundJws = validateInboundJws;
    dummyConfig.validateInboundPutPartiesJws = validateInboundPutPartiesJws;
    // start the server
    const svr = new InboundServer(dummyConfig);
    await svr.setupApi();
    await svr.start();

    // execute the request
    await Koa.__instance.request(request);

    // stop the server
    await svr.stop();

    // validate we got the expected result
    console.log(`result: ${util.inspect(request.response)}`);

    expect(Jws.validator.__validate.mock.calls.length).toEqual(expectedValidationCalls);
}

const generatePartiesRequest = (method, path, body) => {
    const req = JSON.parse(JSON.stringify(partiesRequestTemplate));
    req.method = method;
    req.path = path;
    req.body = body;
    req.headers.date = new Date().toISOString();
    return req;
};

const generateParticipantsRequest = () => {
    const req = JSON.parse(JSON.stringify(participantsRequestTemplate));
    req.body = putParticipantsBody;
    req.headers.date = new Date().toISOString();
    return req;
};

describe('inbound API', () => {
    describe('PUT /parties', () => {
        beforeEach(() => {
            Jws.validator.__validate.mockClear();
        });

        function testPartiesJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            const req = generatePartiesRequest('PUT', '/parties/MSISDN/123456789', putPartiesBody);
            const request = new DummyRequest(req);
            return testInboundJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls, request);
        }

        test('validates incoming JWS when VALIDATE_INBOUND_JWS and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testPartiesJwsValidation(true, true, 1));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testPartiesJwsValidation(true, false, 0));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testPartiesJwsValidation(false, false, 0));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testPartiesJwsValidation(false, true, 0));
    });

    describe('PUT /quotes', () => {
        beforeEach(() => {
            Jws.validator.__validate.mockClear();
        });
        function testQuotesJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            const req = generatePartiesRequest('POST', '/quotes', postQuotesBody);
            const request = new DummyRequest(req);
            return testInboundJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls, request);
        }

        test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testQuotesJwsValidation(true, false, 1));

        test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testQuotesJwsValidation(true, true, 1));
    });

    describe('PUT /participants', () => {
        beforeEach(() => {
            Jws.validator.__validate.mockClear();
        });

        function testParticipantsJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            const req = generateParticipantsRequest();
            const request = new DummyRequest(req);
            return testInboundJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls, request);
        }

        test('validates incoming JWS when VALIDATE_INBOUND_JWS is true', () =>
            testParticipantsJwsValidation(true, true, 1));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false ', () =>
            testParticipantsJwsValidation(false, false, 0));
    });
});

describe('Inbound Server mTLS test', () => {
    let defConfig;
    let httpServerSpy;
    let httpsServerSpy;

    beforeAll(() => {
        httpServerSpy = jest.spyOn(http, 'createServer');
        httpsServerSpy = jest.spyOn(https, 'createServer');
    });

    beforeEach(() => {
        defConfig = JSON.parse(JSON.stringify(defaultConfig));
        httpServerSpy.mockClear();
        httpsServerSpy.mockClear();
    });

    afterAll(() => {
        httpServerSpy.mockRestore();
        httpsServerSpy.mockRestore();
    });

    async function testTlsServer(enableTls) {
        defConfig.tls.inbound.mutualTLS.enabled = enableTls;
        const server = new InboundServer(defConfig);
        await server.setupApi();
        if (enableTls) {
            expect(httpsServerSpy).toHaveBeenCalled();
            expect(httpServerSpy).not.toHaveBeenCalled();
        } else {
            expect(httpsServerSpy).not.toHaveBeenCalled();
            expect(httpServerSpy).toHaveBeenCalled();
        }
    }

    test('Inbound server should use HTTPS if inbound mTLS enabled', () =>
        testTlsServer(true));

    test('Inbound server should use HTTP if inbound mTLS disabled', () =>
        testTlsServer(false));
});
