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


// load default local environment vars
//require('dotenv').config({path: 'local.env'});

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');
const redis = require('redis');

const { init, destroy, setConfig, getConfig } = require('../../../../config.js');
const path = require('path');
const Cache = require('@internal/cache');
const { Logger } = require('@internal/log');
const Model = require('@internal/model').AccountsModel;
const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const defaultEnv = require('./data/defaultEnv');
const transferRequest = require('./data/transferRequest');

let logTransports;
let dummyCacheConfig;


function generateAccounts(count, currencies) {
    const accounts = [];
    for (let currencyIndex = 0; currencyIndex < currencies.length; currencyIndex++) {
        for (let i = 1; i <= count; i++) {
            accounts.push({
                idType: 'MSISDN',
                idValue: String(i * (currencyIndex + 1)).padStart(9, '0'),
                idSubValue: `Sub_${String(i * (currencyIndex + 1))}`.padStart(5, '0'),
                currency: currencies[currencyIndex],
            });
        }
    }
    return accounts;
}


async function testCreateAccount(count, currencies) {
    const MAX_ITEMS_PER_REQUEST = 10000; // As per API Spec 6.2.2.2 (partyList field)

    await setConfig(defaultEnv);
    const conf = getConfig();
    const cache = new Cache(dummyCacheConfig);
    await cache.connect();

    MojaloopRequests.__postParticipants = jest.fn(request => {
        // simulate a response from ALS
        const response = {
            type: 'accountsCreationSuccessfulResponse',
            data: {
                partyList: request.partyList.map(party => ({
                    partyId: party,
                    // errorInformation: null
                })),
                currency: request.currency,
            },
        };
        cache.subscriptionClient.emitMessage('message', `ac_${request.requestId}`, JSON.stringify(response));
        return Promise.resolve();
    });

    const model = new Model({
        cache,
        logger: new Logger({ context: { app: 'accounts-model-unit-tests' }, space:4, transports:logTransports }),
        ...conf
    });

    const postParticipantsSpy = jest.spyOn(model.requests, 'postParticipants');

    const accounts = generateAccounts(count, currencies);
    await model.initialize({ accounts });

    expect(StateMachine.__instance.state).toBe('start');

    // wait for the model to reach a terminal state
    const result = await model.run();

    // console.log(`Accounts creation result: ${util.inspect(result)}`);

    const expectedRequestsCount = currencies.length *
        (Math.floor(count / MAX_ITEMS_PER_REQUEST) + ((count % MAX_ITEMS_PER_REQUEST) ? 1 : 0));
    expect(postParticipantsSpy).toHaveBeenCalledTimes(expectedRequestsCount);

    expect(result.currentState).toBe('COMPLETED');
    expect(StateMachine.__instance.state).toBe('succeeded');
}


describe('AccountsModel', () => {
    // the keys are under the "secrets" folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    defaultEnv.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', defaultEnv.JWS_SIGNING_KEY_PATH);
    defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY);

    beforeAll(async () => {
        logTransports = await Promise.all([() => {}]);
        dummyCacheConfig = {
            host: 'dummycachehost',
            port: 1234,
            logger: new Logger({ context: { app: 'outbound-model-unit-tests-cache' }, space: 4, transports: logTransports })
        };
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
        await setConfig(defaultEnv);
        const conf = getConfig();

        const cache = new Cache(dummyCacheConfig);
        await cache.connect();

        const model = new Model({
            cache: cache,
            logger: new Logger({ context: { app: 'accounts-model-unit-tests' }, space:4, transports:logTransports }),
            ...conf
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');
    });

    test('create 100 accounts', () =>
        testCreateAccount(100, ['USD', 'EUR', 'UAH']));

    test('create 20000 accounts', () =>
        testCreateAccount(20000, ['USD', 'EUR']));
});
