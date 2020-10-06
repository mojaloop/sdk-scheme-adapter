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

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const Cache = require('@internal/cache');
const { AccountsModel } = require('@internal/model');

const StateMachine = require('javascript-state-machine');
const { MojaloopRequests, Logger } = require('@mojaloop/sdk-standard-components');

const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');

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


describe('AccountsModel', () => {
    let logger;
    let cache;

    async function testCreateAccount(count, currencies) {
        const MAX_ITEMS_PER_REQUEST = 10000; // As per API Spec 6.2.2.2 (partyList field)

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
            cache.publish(`ac_${request.requestId}`, JSON.stringify(response));
            return Promise.resolve();
        });

        const model = new AccountsModel({
            ...defaultConfig,
            tls: defaultConfig.outbound.tls,
            cache,
            logger,
        });

        const accounts = generateAccounts(count, currencies);
        await model.initialize({ accounts });

        expect(StateMachine.__instance.state).toBe('start');

        // wait for the model to reach a terminal state
        const result = await model.run();

        const expectedRequestsCount = currencies.length *
            (Math.floor(count / MAX_ITEMS_PER_REQUEST) + ((count % MAX_ITEMS_PER_REQUEST) ? 1 : 0));
        expect(MojaloopRequests.__postParticipants).toHaveBeenCalledTimes(expectedRequestsCount);

        expect(result.currentState).toBe('COMPLETED');
        expect(StateMachine.__instance.state).toBe('succeeded');
    }

    beforeAll(() => {
        logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
    });

    beforeEach(async () => {
        cache = new Cache({
            host: 'dummycachehost',
            port: 1234,
            logger,
        });
        await cache.connect();
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('initializes to starting state', async () => {
        const model = new AccountsModel({
            ...defaultConfig,
            tls: defaultConfig.outbound.tls,
            cache,
            logger,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');
    });

    test('create 100 accounts', () =>
        testCreateAccount(100, ['USD', 'EUR', 'UAH']));

    test('create 20000 accounts', () =>
        testCreateAccount(20000, ['USD', 'EUR']));
});
