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

// we use a mock koa (from our __mocks__ directory
jest.mock('koa');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const defaultConfig = {
    inboundPort: 4000,
    outboundPort: 4001,
    peerEndpoint: '172.17.0.2:3001',
    backendEndpoint: '172.17.0.2:3001',
    dfspId: 'mojaloop-sdk',
    ilpSecret: 'mojaloop-sdk',
    checkIlp: true,
    expirySeconds: 60,
    autoAcceptQuotes: true,
    autoAcceptParty: true,
    useQuoteSourceFSPAsTransferPayeeFSP: false,
    tls: {
        mutualTLS: { enabled: false },
        inboundCreds: {
            ca: null,
            cert: null,
            key: null
        },
        outboundCreds: {
            ca: null,
            cert: null,
            key: null
        }
    },
    validateInboundJws: true,
    validateInboundPutPartiesJws: false,
    jwsSign: true,
    jwsSignPutParties: false,
    jwsSigningKey: null,
    jwsVerificationKeysDirectory: null,
    cacheConfig: {
        host: 'localhost',
        port: 6379
    },
    enableTestFeatures: false,
    oauthTestServer: {
        enabled: false,
    },
    wso2Auth: {
        refreshSeconds: 3600,
    },
};


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

const putPartiesBody = {
    'party': {
        'partyIdInfo': {
            'partyIdType': 'MSISDN',
            'partyIdentifier': '123456789',
            'fspId': 'sim'
        },
        'personalInfo': {
            'complexName': {
                'firstName': 'John',
                'middleName': 'Someone',
                'lastName': 'Doe'
            },
            'dateOfBirth': '1980-01-01'
        },
        'name': 'John Doe',
        'merchantClassificationCode': '1234'
    }
};

const postQuotesBody = {
    'quoteId': '00000000-0000-1000-a000-000000000002',
    'transactionId': '00000000-0000-1000-a000-000000000002',
    'amountType': 'SEND',
    'amount': {
        'currency': 'XOF',
        'amount': '100'
    },
    'expiration': '2019-06-04T04:02:10.378Z',
    'payer': {
        'partyIdInfo': {
            'partyIdType': 'MSISDN',
            'partyIdentifier': '17855501914',
            'fspId': 'mojaloop-sdk'
        },
        'personalInfo': {
            'complexName': {
                'firstName': 'Murthy',
                'lastName': 'Kakarlamudi'
            },
            'dateOfBirth': '2010-10-10'
        },
        'name': 'Murthy Kakarlamudi',
        'merchantClassificationCode': '123'
    },
    'payee': {
        'partyIdInfo': {
            'partyIdType': 'MSISDN',
            'partyIdentifier': '17039811907',
            'fspId': 'mojaloop-sdk'
        },
        'personalInfo': {
            'complexName': {
                'firstName': 'Sridevi',
                'lastName': 'Miriyala'
            },
            'dateOfBirth': '2010-10-10'
        },
        'name': 'Sridevi Miriyala',
        'merchantClassificationCode': '456'
    },
    'transactionType': {
        'scenario': 'TRANSFER',
        'initiator': 'PAYER',
        'initiatorType': 'CONSUMER'
    },
    'note': 'note'
};

const requestTemplate = {
    path: '/parties',
    method: 'PUT',
    body: putPartiesBody,
    headers: {
        'content-type': 'application/vnd.interoperability.parties+json;version=1.0',
        'fspiop-source': 'other-dfsp',
        'fspiop-destination': 'mojaloop-sdk',
        'fspiop-http-method': 'PUT',
        'fspiop-uri': '/parties/MSISDN/123456789',
        'fspiop-signature': '{"signature":"aTTa1TTCBJA1K1VoEFgpSicWYU0q1VYXV-bjkk7uoeNicog7QSp9_AbwtYm4u8NJ1HFM_3mekE8wioAs5YNugnTlJ1k-q4Ouvp5Jo3ZnozoPVtnLaqdhxRMUBOHfDp0X8eCHEo7lETjKcCcH4r5_KT_9Vwx5TMytoG_y9Be8PpviJFkOqOV5jCeIl7XzL_pZQoY0pRJdkXDzYpXDu-HTYKr8ckxWQzx4HO-viJQd2ByQkbqPfQom9IQaAX1t4yztCCpOQn1LY9j9sbfEX9RPXG3UbY6UyDsNjUKYP9BAhXwI9pFWlgv2i9FvEtay2QYdwbW7XEpIiGZ_vi5d6yc12w","protectedHeader":"eyJhbGciOiJSUzI1NiIsIkZTUElPUC1VUkkiOiIvcGFydGllcy9NU0lTRE4vMTIzNDU2Nzg5IiwiRlNQSU9QLUhUVFAtTWV0aG9kIjoiUFVUIiwiRlNQSU9QLVNvdXJjZSI6InNpbSIsIkZTUElPUC1EZXN0aW5hdGlvbiI6ImRmc3AiLCJEYXRlIjoiVGh1LCAzMSBPY3QgMjAxOSAxMTo0MTo0MyBHTVQifQ"}',
        'date': new Date().toISOString(),
        'accept': ''
    }
};

const index = require('../../index.js');


describe('inbound API', () => {

    // beforeEach(() => {
    // });

    test('validates incoming JWS on PUT /parties when VALIDATE_INBOUND_JWS and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = true;
        dummyConfig.validateInboundPutPartiesJws = true;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.path = '/parties/MSISDN/123456789';
        req.method = 'PUT';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(1);
    });


    test('does not validate incoming JWS on PUT /parties when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = true;
        dummyConfig.validateInboundPutPartiesJws = false;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.path = '/parties/MSISDN/123456789';
        req.method = 'PUT';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(0);
    });


    test('does not validate incoming JWS on PUT /parties when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = false;
        dummyConfig.validateInboundPutPartiesJws = false;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.path = '/parties/MSISDN/123456789';
        req.method = 'PUT';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(0);
    });


    test('does not validate incoming JWS on PUT /parties when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = false;
        dummyConfig.validateInboundPutPartiesJws = true;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.path = '/parties/MSISDN/123456789';
        req.method = 'PUT';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(0);
    });


    test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = true;
        dummyConfig.validateInboundPutPartiesJws = false;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.body = JSON.parse(JSON.stringify(postQuotesBody));
        req.path = '/quotes';
        req.method = 'POST';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(1);
    }); 


    test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', async () => {
        const dummyConfig = JSON.parse(JSON.stringify(defaultConfig));

        // set all jws validation ON
        dummyConfig.validateInboundJws = true;
        dummyConfig.validateInboundPutPartiesJws = true;
        // start the server
        const svr = new index.Server(dummyConfig);

        await svr.start();

        let req = JSON.parse(JSON.stringify(requestTemplate));
        req.body = JSON.parse(JSON.stringify(postQuotesBody));
        req.path = '/quotes';
        req.method = 'POST';

        // simulate a PUT /parties/{type}/{id} request
        let request = new DummyRequest(req);
        await svr.inboundApi.request(request);

        const validateCalled = svr.jwsValidator.validateCalled;

        // stop the server
        await svr.stop();

        // validate we got the expected result
        console.log(`result: ${util.inspect(request.response)}`);

        expect(validateCalled).toEqual(1);
    }); 
 
});
