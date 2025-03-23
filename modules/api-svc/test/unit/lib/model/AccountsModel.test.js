/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Yevhen Kyriukha - <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const Cache = require('~/lib/cache');
const { AccountsModel } = require('~/lib/model');

const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { logger } = require('~/lib/logger');
const { SDKStateEnum } = require('../../../../src/lib/model/common');

const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');

function generateAccounts(count, currencies) {
    const accounts = [];
    if (currencies) {
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
    } else {
        for (let i = 1; i <= count; i++) {
            accounts.push({
                idType: 'MSISDN',
                idValue: String(i).padStart(9, '0'),
                idSubValue: `Sub_${String(i)}`.padStart(5, '0'),
            });
        }
    }
    return accounts;
}


describe('AccountsModel', () => {
    let cache;

    async function testCreateAccount(count, currencies) {
        const MAX_ITEMS_PER_REQUEST = 10000; // As per API Spec 6.2.2.2 (partyList field)

        MojaloopRequests.__postParticipants = jest.fn(request => {
            // simulate a response from ALS
            const response = {
                type: 'accountsCreationSuccessfulResponse',
                data: {
                    body: {
                        partyList: request.partyList.map(party => ({
                            partyId: party,
                            // errorInformation: null
                        })),
                        currency: request?.currency,
                    },
                    headers: {}
                },
            };
            cache.publish(`ac_${request.requestId}`, response);
            return Promise.resolve();
        });

        const model = new AccountsModel({
            ...defaultConfig,
            cache,
            logger,
        });

        const accounts = generateAccounts(count, currencies);
        await model.initialize({ accounts });

        expect(StateMachine.__instance.state).toBe('start');

        // wait for the model to reach a terminal state
        const result = await model.run();
        const expectedRequestsCount = (currencies?.length || 1) *
            (Math.floor(count / MAX_ITEMS_PER_REQUEST) + ((count % MAX_ITEMS_PER_REQUEST) ? 1 : 0));
        expect(MojaloopRequests.__postParticipants).toHaveBeenCalledTimes(expectedRequestsCount);

        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    }

    beforeEach(async () => {
        cache = new Cache({
            cacheUrl: 'redis://dummy:1234',
            logger,
            unsubscribeTimeoutMs: 5000,
        });
        await cache.connect();
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('initializes to starting state', async () => {
        const model = new AccountsModel({
            ...defaultConfig,
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

    test('create 100 accounts without currencies', () =>
        testCreateAccount(100, null));

});
