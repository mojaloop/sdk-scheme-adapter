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


// load default local environment vars
//require('dotenv').config({path: 'local.env'});

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');


const { init, destroy, setConfig, getConfig } = require('../../../../config.js');
const util = require('util');
const path = require('path');
const MockCache = require('../../../__mocks__/@internal/cache.js');
const { Logger, Transports } = require('@internal/log');
const Model = require('@internal/model').outboundTransfersModel;

let logTransports;


// dummy environment config
const config = {
    INBOUND_LISTEN_PORT: '4000',
    OUTBOUND_LISTEN_PORT: '4001',
    MUTUAL_TLS_ENABLED: 'false',
    VALIDATE_INBOUND_JWS: 'true',
    JWS_SIGN: 'true',
    JWS_SIGNING_KEY_PATH: '/jwsSigningKey.key',
    JWS_VERIFICATION_KEYS_DIRECTORY: '/jwsVerificationKeys',
    IN_CA_CERT_PATH: './secrets/cacert.pem',
    IN_SERVER_CERT_PATH: './secrets/servercert.pem',
    IN_SERVER_KEY_PATH: './secrets/serverkey.pem',
    OUT_CA_CERT_PATH: './secrets/cacert.pem',
    OUT_CLIENT_CERT_PATH: './secrets/servercert.pem',
    OUT_CLIENT_KEY_PATH: './secrets/serverkey.pem',
    LOG_INDENT: '0',
    CACHE_HOST: '172.17.0.2',
    CACHE_PORT: '6379',
    PEER_ENDPOINT: '172.17.0.3:4000',
    BACKEND_ENDPOINT: '172.17.0.5:4000',
    DFSP_ID: 'mojaloop-sdk',
    ILP_SECRET: 'Quaixohyaesahju3thivuiChai5cahng',
    EXPIRY_SECONDS: '60',
    AUTO_ACCEPT_QUOTES: 'false',
    AUTO_ACCEPT_PARTY: 'false',
    CHECK_ILP: 'true',
    ENABLE_TEST_FEATURES: 'false',
    ENABLE_OAUTH_TOKEN_ENDPOINT: 'false',
    WS02_BEARER_TOKEN: '7718fa9b-be13-3fe7-87f0-a12cf1628168',
    OAUTH_TOKEN_ENDPOINT: '',
    OAUTH_CLIENT_KEY: '',
    OAUTH_CLIENT_SECRET: '',
    OAUTH_REFRESH_SECONDS: '3600',
    REJECT_EXPIRED_QUOTE_RESPONSES: 'false',
    REJECT_TRANSFERS_ON_EXPIRED_QUOTES: 'false',
    REJECT_EXPIRED_TRANSFER_FULFILS: 'false',
};


// a dummy transfer request
const transferRequest = {
    'from': {
        'displayName': 'James Bush',
        'idType': 'MSISDN',
        'idValue': '447710066017'
    },
    'to': {
        'idType': 'MSISDN',
        'idValue': '123456789'
    },
    'amountType': 'SEND',
    'currency': 'USD',
    'amount': '100',
    'transactionType': 'TRANSFER',
    'note': 'test payment',
    'homeTransactionId': '123ABC',
    'quoteRequestExtensions': [
        { 'key': 'qkey1', 'value': 'qvalue1' },
        { 'key': 'qkey2', 'value': 'qvalue2' }
    ],
    'transferRequestExtensions': [
        { 'key': 'tkey1', 'value': 'tvalue1' },
        { 'key': 'tkey2', 'value': 'tvalue2' }
    ]
};


// a dummy payee party
const payeeParty = {
    'party': {
        'partyIdInfo': {
            'partyIdType': 'MSISDN',
            'partyIdentifier': '123456789',
            'fspId': 'MobileMoney'
        },
        'personalInfo': {
            'complexName': {
                'firstName': 'John',
                'lastName': 'Doe'
            }
        }
    }
};


// a dummy quote response
const quoteResponse = {
    'type': 'quoteResponse',
    'data': {
        'transferAmount': {
            'amount': '500',
            'currency': 'USD'
        },
        'payeeReceiveAmount': {
            'amount': '490',
            'currency': 'USD'
        },
        'payeeFspFee': {
            'amount': '5',
            'currency': 'USD'
        },
        'payeeFspCommission': {
            'amount': '5',
            'currency': 'USD'
        },
        'geoCode': {
            'latitude': '53.295971',
            'longitude': '-0.038500'
        },
        'expiration': '2017-11-15T14:17:09.663+01:00',
        'ilpPacket': 'AQAAAAAAACasIWcuc2UubW9iaWxlbW9uZXkubXNpc2RuLjEyMzQ1Njc4OYIEIXsNCiAgICAidHJhbnNhY3Rpb25JZCI6ICI4NWZlYWMyZi0zOWIyLTQ5MWItODE3ZS00YTAzMjAzZDRmMTQiLA0KICAgICJxdW90ZUlkIjogIjdjMjNlODBjLWQwNzgtNDA3Ny04MjYzLTJjMDQ3ODc2ZmNmNiIsDQogICAgInBheWVlIjogew0KICAgICAgICAicGFydHlJZEluZm8iOiB7DQogICAgICAgICAgICAicGFydHlJZFR5cGUiOiAiTVNJU0ROIiwNCiAgICAgICAgICAgICJwYXJ0eUlkZW50aWZpZXIiOiAiMTIzNDU2Nzg5IiwNCiAgICAgICAgICAgICJmc3BJZCI6ICJNb2JpbGVNb25leSINCiAgICAgICAgfSwNCiAgICAgICAgInBlcnNvbmFsSW5mbyI6IHsNCiAgICAgICAgICAgICJjb21wbGV4TmFtZSI6IHsNCiAgICAgICAgICAgICAgICAiZmlyc3ROYW1lIjogIkhlbnJpayIsDQogICAgICAgICAgICAgICAgImxhc3ROYW1lIjogIkthcmxzc29uIg0KICAgICAgICAgICAgfQ0KICAgICAgICB9DQogICAgfSwNCiAgICAicGF5ZXIiOiB7DQogICAgICAgICJwZXJzb25hbEluZm8iOiB7DQogICAgICAgICAgICAiY29tcGxleE5hbWUiOiB7DQogICAgICAgICAgICAgICAgImZpcnN0TmFtZSI6ICJNYXRzIiwNCiAgICAgICAgICAgICAgICAibGFzdE5hbWUiOiAiSGFnbWFuIg0KICAgICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICAicGFydHlJZEluZm8iOiB7DQogICAgICAgICAgICAicGFydHlJZFR5cGUiOiAiSUJBTiIsDQogICAgICAgICAgICAicGFydHlJZGVudGlmaWVyIjogIlNFNDU1MDAwMDAwMDA1ODM5ODI1NzQ2NiIsDQogICAgICAgICAgICAiZnNwSWQiOiAiQmFua05yT25lIg0KICAgICAgICB9DQogICAgfSwNCiAgICAiYW1vdW50Ijogew0KICAgICAgICAiYW1vdW50IjogIjEwMCIsDQogICAgICAgICJjdXJyZW5jeSI6ICJVU0QiDQogICAgfSwNCiAgICAidHJhbnNhY3Rpb25UeXBlIjogew0KICAgICAgICAic2NlbmFyaW8iOiAiVFJBTlNGRVIiLA0KICAgICAgICAiaW5pdGlhdG9yIjogIlBBWUVSIiwNCiAgICAgICAgImluaXRpYXRvclR5cGUiOiAiQ09OU1VNRVIiDQogICAgfSwNCiAgICAibm90ZSI6ICJGcm9tIE1hdHMiDQp9DQo\u003d\u003d',
        'condition': 'fH9pAYDQbmoZLPbvv3CSW2RfjU4jvM4ApG_fqGnR7Xs'
    },
    'headers': {
        'fspiop-source': 'foo'
    }
};


// a dummy transfer fulfilment
const transferFulfil = {
    'type': 'transferFulfil',
    'data': {
        'fulfilment': '87mm1-reS3SAi8oIWXgBkLmgWc1MkZ_yLbFDX5XAdo5o',
        'completedTimestamp': '2017-11-15T14:16:09.663+01:00',
        'transferState': 'COMMITTED'
    }
};

/**
 *
 * @param {Object} opts
 * @param {Number} opts.expirySeconds
 * @param {Object} opts.delays
 * @param {Number} delays.requestQuotes
 * @param {Number} delays.prepareTransfer
 * @param {Object} opts.rejects
 * @param {boolean} rejects.quoteResponse
 * @param {boolean} rejects.transferFulfils
 */
async function testTransferWithDelay({expirySeconds, delays, rejects}) {
    config.AUTO_ACCEPT_PARTY = 'true';
    config.AUTO_ACCEPT_QUOTES = 'true';

    config.EXPIRY_SECONDS = expirySeconds.toString();
    config.REJECT_EXPIRED_QUOTE_RESPONSES = rejects.quoteResponse ? 'true' : 'false';
    config.REJECT_EXPIRED_TRANSFER_FULFILS = rejects.transferFulfils ? 'true' : 'false';

    await setConfig(config);
    const conf = getConfig();

    const model = new Model({
        cache: new MockCache(),
        logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
        ...conf
    });

    await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

    expect(model.stateMachine.state).toBe('start');

    model.requests.on('getParties', () => {
        // simulate a callback with the resolved party
        model.cache.emitMessage(JSON.stringify(payeeParty));
    });

    model.requests.on('postQuotes', () => {
        // simulate a delayed callback with the quote response
        setTimeout(() => {
            model.cache.emitMessage(JSON.stringify(quoteResponse));
        }, delays.requestQuotes ? delays.requestQuotes * 1000 : 0);
    });

    model.requests.on('postTransfers', () => {
        // simulate a delayed callback with the transfer fulfilment
        setTimeout(() => {
            model.cache.emitMessage(JSON.stringify(transferFulfil));
        }, delays.prepareTransfer ? delays.prepareTransfer * 1000 : 0);
    });

    let expectError;
    if (rejects.quoteResponse && delays.requestQuotes && expirySeconds < delays.requestQuotes) {
        expectError = 'Quote response missed expiry deadline';
    }
    if (rejects.transferFulfils && delays.prepareTransfer && expirySeconds < delays.prepareTransfer) {
        expectError = 'Transfer fulfil missed expiry deadline';
    }
    if (expectError) {
        await expect(model.run()).rejects.toThrowError(expectError);
        expect(model.stateMachine.state).toBe('errored');
    } else {
        const result = await model.run();
        await expect(result.currentState).toBe('COMPLETED');
        expect(model.stateMachine.state).toBe('succeeded');
    }
}

describe('outboundModel', () => {
    // the keys are under the "secrets" folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    config.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', config.JWS_SIGNING_KEY_PATH);
    config.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', config.JWS_VERIFICATION_KEYS_DIRECTORY);

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
    });

    beforeEach(async () => {
        init();
    });

    afterEach(async () => {
        //we have to destroy the file system watcher or we will leave an async handle open
        destroy();
        console.log('config destroyed');
    });


    test('initializes to starting state', async () => {
        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');
    });


    test('executes all three transfer stages without halting when AUTO_ACCEPT_PARTY and AUTO_ACCEPT_QUOTES are true', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        const postQuotesSpy = jest.spyOn(model.requests, 'postQuotes');
        const postTransfersSpy = jest.spyOn(model.requests, 'postTransfers');

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        model.requests.on('getParties', () => {
            // simulate a callback with the resolved party
            model.cache.emitMessage(JSON.stringify(payeeParty));
        });

        model.requests.on('postQuotes', () => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            expect(postQuotesSpy).toHaveBeenCalledTimes(1);
            expect(postQuotesSpy.mock.calls[0][0].extensionList).toBeTruthy();
            expect(postQuotesSpy.mock.calls[0][0].extensionList.extension).toBeTruthy();
            expect(postQuotesSpy.mock.calls[0][0].extensionList.extension.length).toBe(2);
            expect(postQuotesSpy.mock.calls[0][0].extensionList.extension[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(postQuotesSpy.mock.calls[0][0].extensionList.extension[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            model.cache.emitMessage(JSON.stringify(quoteResponse));
        });

        model.requests.on('postTransfers', () => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);
            expect(postTransfersSpy).toHaveBeenCalledTimes(1);

            expect(postTransfersSpy.mock.calls[0][0].extensionList.extension).toBeTruthy();
            expect(postTransfersSpy.mock.calls[0][0].extensionList.extension.length).toBe(2);
            expect(postTransfersSpy.mock.calls[0][0].extensionList.extension[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(postTransfersSpy.mock.calls[0][0].extensionList.extension[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(postTransfersSpy.mock.calls[0][1]).toBe(quoteResponse.headers['fspiop-source']);
            expect(model.data.to.fspId).toBe(payeeParty.party.partyIdInfo.fspId);
            expect(quoteResponse.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(transferFulfil));
        });

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(model.stateMachine.state).toBe('succeeded');
    });


    test('resolves payee and halts when AUTO_ACCEPT_PARTY is false', async () => {
        config.AUTO_ACCEPT_PARTY = 'false';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        model.cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(model.stateMachine.state).toBe('payeeResolved');
    });


    test('halts after resolving payee, resumes and then halts after receiving quote response when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        config.AUTO_ACCEPT_PARTY = 'false';
        config.AUTO_ACCEPT_QUOTES = 'false';

        await setConfig(config);
        const conf = getConfig();

        const cache = new MockCache();

        let model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        model.cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(model.stateMachine.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // check the model saved itself to the cache
        expect(model.cache.data[`transferModel_${transferId}`]).toBeTruthy();

        // load a new model from the saved state
        model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(model.stateMachine.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the quote response
        model.cache.emitMessage(JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after request quote: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(model.stateMachine.state).toBe('quoteReceived');
    });


    test('halts and resumes after parties and quotes stages when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        config.AUTO_ACCEPT_PARTY = 'false';
        config.AUTO_ACCEPT_QUOTES = 'false';

        await setConfig(config);
        const conf = getConfig();

        const cache = new MockCache();

        let model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        model.cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(model.stateMachine.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // check the model saved itself to the cache
        expect(model.cache.data[`transferModel_${transferId}`]).toBeTruthy();

        // load a new model from the saved state
        model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(model.stateMachine.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the quote response
        model.cache.emitMessage(JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after request quote: ${util.inspect(result)}`);

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(model.stateMachine.state).toBe('quoteReceived');

        // load a new model from the saved state
        model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(model.stateMachine.state).toBe('quoteReceived');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the transfer fulfilment
        model.cache.emitMessage(JSON.stringify(transferFulfil));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after transfer fulfil: ${util.inspect(result)}`);

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe('COMPLETED');
        expect(model.stateMachine.state).toBe('succeeded');
    });

    test('uses payee party fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is false', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';
        config.USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP = 'false';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        jest.spyOn(model.requests, 'postQuotes');
        const postTransfersSpy = jest.spyOn(model.requests, 'postTransfers');

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        model.requests.on('getParties', () => {
            // simulate a callback with the resolved party
            model.cache.emitMessage(JSON.stringify(payeeParty));
        });

        model.requests.on('postQuotes', () => {
            // simulate a callback with the quote response
            model.cache.emitMessage(JSON.stringify(quoteResponse));
        });

        model.requests.on('postTransfers', () => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);
            expect(postTransfersSpy).toHaveBeenCalledTimes(1);
            expect(postTransfersSpy.mock.calls[0][0].payeeFsp).toEqual(payeeParty.party.partyIdInfo.fspId);

            // simulate a callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(transferFulfil));
        });

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(model.stateMachine.state).toBe('succeeded');
    });

    test('uses quote response source fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is true', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';
        config.USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP = 'true';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        jest.spyOn(model.requests, 'postQuotes');
        const postTransfersSpy = jest.spyOn(model.requests, 'postTransfers');

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        model.requests.on('getParties', () => {
            // simulate a callback with the resolved party
            model.cache.emitMessage(JSON.stringify(payeeParty));
        });

        model.requests.on('postQuotes', () => {
            // simulate a callback with the quote response
            model.cache.emitMessage(JSON.stringify(quoteResponse));
        });

        model.requests.on('postTransfers', () => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);
            expect(postTransfersSpy).toHaveBeenCalledTimes(1);
            expect(postTransfersSpy.mock.calls[0][0].payeeFsp).toEqual(quoteResponse.headers['fspiop-source']);

            // simulate a callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(transferFulfil));
        });

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(model.stateMachine.state).toBe('succeeded');
    });

    test('pass quote response `expiration` deadline', async () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                requestQuotes: 1,
            },
            rejects: {
                quoteResponse: true,
            }
        })
    );

    test('pass transfer fulfills `expiration` deadline', async () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                prepareTransfer: 1,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );

    test('pass all stages `expiration` deadlines', async () =>
        testTransferWithDelay({
            expirySeconds: 2,
            delays: {
                requestQuotes: 1,
                prepareTransfer: 1,
            },
            rejects: {
                quoteResponse: true,
                transferFulfils: true,
            }
        })
    );

    test('fail on quote response `expiration` deadline', async () =>
        testTransferWithDelay({
            expirySeconds: 1,
            delays: {
                requestQuotes: 2,
            },
            rejects: {
                quoteResponse: true,
            }
        })
    );

    test('fail on transfer fulfills `expiration` deadline', async () =>
        testTransferWithDelay({
            expirySeconds: 1,
            delays: {
                prepareTransfer: 2,
            },
            rejects: {
                transferFulfils: true,
            }
        })
    );

    test('Throws with mojaloop error in response body when party resolution error callback occurs', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        const expectError = {
            errorInformation: {
                errorCode: '3204',
                errorDescription: 'Party not found'
            }
        };

        model.requests.on('getParties', () => {
            // simulate a callback with a mojaloop error
            model.cache.emitMessage(JSON.stringify(expectError));
        });

        const errMsg = 'Got an error response resolving party: { errorInformation: { errorCode: \'3204\', errorDescription: \'Party not found\' } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message).toEqual(errMsg);
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when quote request error callback occurs', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        const expectError = {
            type: 'quoteResponseError',
            data: {
                errorInformation: {
                    errorCode: '3205',
                    errorDescription: 'Quote ID not found'
                }
            }
        };

        model.requests.on('getParties', () => {
            // simulate a callback with the resolved party
            model.cache.emitMessage(JSON.stringify(payeeParty));
        });

        model.requests.on('postQuotes', () => {
            // simulate an error callback
            model.cache.emitMessage(JSON.stringify(expectError));
        });

        const errMsg = 'Got an error response requesting quote: { type: \'quoteResponseError\',\n  data:\n   { errorInformation:\n      { errorCode: \'3205\', errorDescription: \'Quote ID not found\' } } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message).toEqual(errMsg);
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when transfer request error callback occurs', async () => {
        config.AUTO_ACCEPT_PARTY = 'true';
        config.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(config);
        const conf = getConfig();

        const model = new Model({
            cache: new MockCache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(model.stateMachine.state).toBe('start');

        const expectError = {
            type: 'transferError',
            data: {
                errorInformation: {
                    errorCode: '4001',
                    errorDescription: 'Payer FSP insufficient liquidity'
                }
            }
        };

        model.requests.on('getParties', () => {
            // simulate a callback with the resolved party
            model.cache.emitMessage(JSON.stringify(payeeParty));
        });

        model.requests.on('postQuotes', () => {
            // simulate a callback with the quote response
            model.cache.emitMessage(JSON.stringify(quoteResponse));
        });

        model.requests.on('postTransfers', () => {
            // simulate an error callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(expectError));
        });


        const errMsg = 'Got an error response preparing transfer: { type: \'transferError\',\n  data:\n   { errorInformation:\n      { errorCode: \'4001\',\n        errorDescription: \'Payer FSP insufficient liquidity\' } } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message).toEqual(errMsg);
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });

});
