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
const Cache = require('@internal/cache');
const { Logger, Transports } = require('@internal/log');
const Model = require('@internal/model').OutboundTransfersModel;
const defaultEnv = require('./data/defaultEnv');
const transferRequest = require('./data/transferRequest');
const payeeParty = require('./data/payeeParty');
const quoteResponseTemplate = require('./data/quoteResponse');
const transferFulfil = require('./data/transferFulfil');

const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const StateMachine = require('javascript-state-machine');

let logTransports;
let quoteResponse;

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
    defaultEnv.AUTO_ACCEPT_PARTY = 'true';
    defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

    defaultEnv.EXPIRY_SECONDS = expirySeconds.toString();
    defaultEnv.REJECT_EXPIRED_QUOTE_RESPONSES = rejects.quoteResponse ? 'true' : 'false';
    defaultEnv.REJECT_EXPIRED_TRANSFER_FULFILS = rejects.transferFulfils ? 'true' : 'false';

    await setConfig(defaultEnv);
    const conf = getConfig();

    const cache = new Cache();

    // simulate a callback with the resolved party
    MojaloopRequests.__getParties = jest.fn(() => cache.emitMessage(JSON.stringify(payeeParty)));

    // simulate a delayed callback with the quote response
    MojaloopRequests.__postQuotes = jest.fn(() => {
        setTimeout(() => {
            cache.emitMessage(JSON.stringify(quoteResponse));
        }, delays.requestQuotes ? delays.requestQuotes * 1000 : 0);
    });

    // simulate a delayed callback with the transfer fulfilment
    MojaloopRequests.__postTransfers = jest.fn(() => {
        setTimeout(() => {
            cache.emitMessage(JSON.stringify(transferFulfil));
        }, delays.prepareTransfer ? delays.prepareTransfer * 1000 : 0);
    });

    const model = new Model({
        cache,
        logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
        ...conf
    });

    await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

    expect(StateMachine.__instance.state).toBe('start');

    let expectError;
    if (rejects.quoteResponse && delays.requestQuotes && expirySeconds < delays.requestQuotes) {
        expectError = 'Quote response missed expiry deadline';
    }
    if (rejects.transferFulfils && delays.prepareTransfer && expirySeconds < delays.prepareTransfer) {
        expectError = 'Transfer fulfil missed expiry deadline';
    }
    if (expectError) {
        await expect(model.run()).rejects.toThrowError(expectError);
        expect(StateMachine.__instance.state).toBe('errored');
    } else {
        const result = await model.run();
        await expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    }
}

describe('outboundModel', () => {
    // the keys are under the "secrets" folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    defaultEnv.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', defaultEnv.JWS_SIGNING_KEY_PATH);
    defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY);

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
        quoteResponse = JSON.parse(JSON.stringify(quoteResponseTemplate));
    });

    beforeEach(async () => {
        init();
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotesError = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postTransfers = jest.fn(() => Promise.resolve());
    });

    afterEach(async () => {
        //we have to destroy the file system watcher or we will leave an async handle open
        destroy();
        console.log('config destroyed');
    });

    test('initializes to starting state', async () => {
        await setConfig(defaultEnv);
        const conf = getConfig();

        const model = new Model({
            cache: new Cache(),
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));
        expect(StateMachine.__instance.state).toBe('start');
    });


    test('executes all three transfer stages without halting when AUTO_ACCEPT_PARTY and AUTO_ACCEPT_QUOTES are true', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList;
            expect(extensionList).toBeTruthy();
            expect(extensionList.extension).toBeTruthy();
            expect(extensionList.extension.length).toBe(2);
            expect(extensionList.extension[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList.extension[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(quoteResponse));
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList;
            expect(extensionList.extension).toBeTruthy();
            expect(extensionList.extension.length).toBe(2);
            expect(extensionList.extension[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList.extension[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.headers['fspiop-source']);
            expect(model.data.to.fspId).toBe(payeeParty.party.partyIdInfo.fspId);
            expect(quoteResponse.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            // simulate a callback with the transfer fulfilment
            cache.emitMessage(JSON.stringify(transferFulfil));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });


    test('uses quote response transfer amount for transfer prepare', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        // change the the transfer amount and currency in the quote response
        // so it is different to the initial request
        quoteResponse.data.transferAmount = {
            currency: 'XYZ',
            amount: '9876543210'
        };

        expect(quoteResponse.data.transferAmount).not.toEqual({
            amount: transferRequest.amount,
            currency: transferRequest.currency
        });

        MojaloopRequests.__postQuotes = jest.fn((postQuotesBody) => {
            // ensure that the `MojaloopRequests.postQuotes` method has been called with correct arguments
            // including extension list
            const extensionList = postQuotesBody.extensionList;
            expect(extensionList).toBeTruthy();
            expect(extensionList.extension).toBeTruthy();
            expect(extensionList.extension.length).toBe(2);
            expect(extensionList.extension[0]).toEqual({ key: 'qkey1', value: 'qvalue1' });
            expect(extensionList.extension[1]).toEqual({ key: 'qkey2', value: 'qvalue2' });

            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(quoteResponse));
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn((postTransfersBody, destFspId) => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);

            const extensionList = postTransfersBody.extensionList;
            expect(extensionList.extension).toBeTruthy();
            expect(extensionList.extension.length).toBe(2);
            expect(extensionList.extension[0]).toEqual({ key: 'tkey1', value: 'tvalue1' });
            expect(extensionList.extension[1]).toEqual({ key: 'tkey2', value: 'tvalue2' });

            expect(destFspId).toBe(quoteResponse.headers['fspiop-source']);
            expect(model.data.to.fspId).toBe(payeeParty.party.partyIdInfo.fspId);
            expect(quoteResponse.headers['fspiop-source']).not.toBe(model.data.to.fspId);

            expect(postTransfersBody.amount).toEqual(quoteResponse.data.transferAmount);

            // simulate a callback with the transfer fulfilment
            cache.emitMessage(JSON.stringify(transferFulfil));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        expect(MojaloopRequests.__getParties).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledTimes(1);
        expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });


    test('resolves payee and halts when AUTO_ACCEPT_PARTY is false', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'false';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('payeeResolved');
    });


    test('halts after resolving payee, resumes and then halts after receiving quote response when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'false';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'false';

        await setConfig(defaultEnv);
        const conf = getConfig();

        const cache = new Cache();

        let model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // check the model saved itself to the cache
        expect(cache.data[`transferModel_${transferId}`]).toBeTruthy();

        // load a new model from the saved state
        model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the quote response
        cache.emitMessage(JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after request quote: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('quoteReceived');
    });


    test('halts and resumes after parties and quotes stages when AUTO_ACCEPT_PARTY is false and AUTO_ACCEPT_QUOTES is false', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'false';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'false';

        await setConfig(defaultEnv);
        const conf = getConfig();

        const cache = new Cache();

        let model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        let resultPromise = model.run();

        // now we started the model running we simulate a callback with the resolved party
        cache.emitMessage(JSON.stringify(payeeParty));

        // wait for the model to reach a terminal state
        let result = await resultPromise;

        console.log(`Result after resolve payee: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('WAITING_FOR_PARTY_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        const transferId = result.transferId;

        // check the model saved itself to the cache
        expect(cache.data[`transferModel_${transferId}`]).toBeTruthy();

        // load a new model from the saved state
        model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('payeeResolved');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the quote response
        cache.emitMessage(JSON.stringify(quoteResponse));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after request quote: ${util.inspect(result)}`);

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe('WAITING_FOR_QUOTE_ACCEPTANCE');
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // load a new model from the saved state
        model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.load(transferId);

        // check the model loaded to the correct state
        expect(StateMachine.__instance.state).toBe('quoteReceived');

        // now run the model again. this should trigger transition to quote request
        resultPromise = model.run();

        // now we started the model running we simulate a callback with the transfer fulfilment
        cache.emitMessage(JSON.stringify(transferFulfil));

        // wait for the model to reach a terminal state
        result = await resultPromise;

        console.log(`Result after transfer fulfil: ${util.inspect(result)}`);

        // check we stopped at quoteReceived state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('uses payee party fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is false', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';
        defaultEnv.USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP = 'false';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn(() => {
            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(quoteResponse));
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn(() => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);
            expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
            const payeeFsp = MojaloopRequests.__postTransfers.mock.calls[0][0].payeeFsp;
            expect(payeeFsp).toEqual(payeeParty.party.partyIdInfo.fspId);

            // simulate a callback with the transfer fulfilment
            cache.emitMessage(JSON.stringify(transferFulfil));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('uses quote response source fspid for transfer prepare when config USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP is true', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';
        defaultEnv.USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn(() => {
            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(quoteResponse));
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn(() => {
            //ensure that the `MojaloopRequests.postTransfers` method has been called with the correct arguments
            // set as the destination FSPID, picked up from the header's value `fspiop-source`
            expect(model.data.quoteResponseSource).toBe(quoteResponse.headers['fspiop-source']);
            expect(MojaloopRequests.__postTransfers).toHaveBeenCalledTimes(1);
            const payeeFsp = MojaloopRequests.__postTransfers.mock.calls[0][0].payeeFsp;
            expect(payeeFsp).toEqual(quoteResponse.headers['fspiop-source']);

            // simulate a callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(transferFulfil));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const resultPromise = model.run();

        // wait for the model to reach a terminal state
        const result = await resultPromise;

        console.log(`Result after three stage transfer: ${util.inspect(result)}`);

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    });

    test('pass quote response `expiration` deadline', () =>
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

    test('pass transfer fulfills `expiration` deadline', () =>
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

    test('pass all stages `expiration` deadlines', () =>
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

    test('fail on quote response `expiration` deadline', () =>
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

    test('fail on transfer fulfills `expiration` deadline', () =>
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
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.emitMessage(JSON.stringify(expectError));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const expectError = {
            errorInformation: {
                errorCode: '3204',
                errorDescription: 'Party not found'
            }
        };

        const errMsg = 'Got an error response resolving party: { errorInformation: { errorCode: \'3204\', errorDescription: \'Party not found\' } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when quote request error callback occurs', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn(() => {
            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(expectError));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const expectError = {
            type: 'quoteResponseError',
            data: {
                errorInformation: {
                    errorCode: '3205',
                    errorDescription: 'Quote ID not found'
                }
            }
        };

        const errMsg = 'Got an error response requesting quote: { errorInformation:\n   { errorCode: \'3205\', errorDescription: \'Quote ID not found\' } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });


    test('Throws with mojaloop error in response body when transfer request error callback occurs', async () => {
        defaultEnv.AUTO_ACCEPT_PARTY = 'true';
        defaultEnv.AUTO_ACCEPT_QUOTES = 'true';

        await setConfig(defaultEnv);
        const conf = getConfig();
        const cache = new Cache();

        MojaloopRequests.__getParties = jest.fn(() => {
            // simulate a callback with the resolved party
            cache.emitMessage(JSON.stringify(payeeParty));
            return Promise.resolve();
        });

        MojaloopRequests.__postQuotes = jest.fn(() => {
            // simulate a callback with the quote response
            cache.emitMessage(JSON.stringify(quoteResponse));
            return Promise.resolve();
        });

        MojaloopRequests.__postTransfers = jest.fn(() => {
            // simulate an error callback with the transfer fulfilment
            model.cache.emitMessage(JSON.stringify(expectError));
            return Promise.resolve();
        });

        const model = new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        const expectError = {
            type: 'transferError',
            data: {
                errorInformation: {
                    errorCode: '4001',
                    errorDescription: 'Payer FSP insufficient liquidity'
                }
            }
        };

        const errMsg = 'Got an error response preparing transfer: { errorInformation:\n   { errorCode: \'4001\',\n     errorDescription: \'Payer FSP insufficient liquidity\' } }';

        try {
            await model.run();
        }
        catch(err) {
            expect(err.message.replace(/[ \n]/g,'')).toEqual(errMsg.replace(/[ \n]/g,''));
            expect(err.transferState).toBeTruthy();
            expect(err.transferState.lastError).toBeTruthy();
            expect(err.transferState.lastError.mojaloopError).toEqual(expectError.data);
            expect(err.transferState.lastError.transferState).toBe(undefined);
            return;
        }

        throw new Error('Outbound model should have thrown');
    });

});

describe('Outbound mTLS test', () => {
    let defConfig;

    beforeEach(async () => {
        init();
        await setConfig(defaultEnv);
        defConfig = JSON.parse(JSON.stringify(getConfig()));
        MojaloopRequests.__postParticipants = jest.fn(() => Promise.resolve());
        MojaloopRequests.__getParties = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotes = jest.fn(() => Promise.resolve());
        MojaloopRequests.__putQuotesError = jest.fn(() => Promise.resolve());
        MojaloopRequests.__postTransfers = jest.fn(() => Promise.resolve());
    });

    afterEach(async () => {
        //we have to destroy the file system watcher or we will leave an async handle open
        destroy();
        console.log('config destroyed');
    });

    async function testTlsServer(enableTls) {
        defConfig.tls.outbound.mutualTLS.enabled = enableTls;

        const cache = new Cache();
        new Model({
            cache,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests' }, space:4, transports:logTransports }),
            ...defConfig
        });

        const scheme = enableTls ? 'https' : 'http';
        expect(MojaloopRequests.__instance.transportScheme).toBe(scheme);
    }

    test('Outbound server should use HTTPS if outbound mTLS enabled', () =>
        testTlsServer(true));

    test('Outbound server should use HTTP if outbound mTLS disabled', () =>
        testTlsServer(false));
});
