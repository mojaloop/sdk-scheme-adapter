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
const Readable = require('stream').Readable;
const defaultConfig = require('./data/defaultConfig');
const putPartiesBody = require('./data/putPartiesBody');
const postQuotesBody = require('./data/postQuotesBody');
const putParticipantsBody = require('./data/putParticipantsBody');
const partiesRequestTemplate = require('./data/partiesRequestTemplate');
const participantsRequestTemplate = require('./data/participantsRequestTemplate');

// we use a mock koa (from our __mocks__ directory
jest.mock('koa');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const index = require('../../index.js');

class DummyRequest {
    constructor(opts) {
        this.path = opts.path;
        this.method = opts.method;
        this.res = {};
        this.request = {
            headers: opts.headers,
            path: opts.path,
            method: opts.method
        };
        this.response = {};
        this.state = {};

        this.req = new Readable();
        this.req.headers = opts.headers;
        this.req._read = () => {};
        this.req.push(JSON.stringify(opts.body));
        this.req.push(null);
    }
}

async function testInboundJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls, request) {
    const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

    // set all jws validation ON
    dummyConfig.validateInboundJws = validateInboundJws;
    dummyConfig.validateInboundPutPartiesJws = validateInboundPutPartiesJws;
    // start the server
    const svr = new index.Server(dummyConfig);
    await svr.start();

    // execute the request
    await svr.inboundApi.request(request);

    const validateCalled = svr.jwsValidator.validateCalled;

    // stop the server
    await svr.stop();

    // validate we got the expected result
    console.log(`result: ${util.inspect(request.response)}`);

    expect(validateCalled).toEqual(expectedValidationCalls);
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
