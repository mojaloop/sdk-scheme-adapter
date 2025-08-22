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
 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/
'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

const Cache = jest.createMockFromModule('~/lib/cache');

const PSM = require('~/lib/model').PersistentStateMachine;
const mockLogger = require('../../../mockLogger');
describe('PersistentStateMachine', () => {
    let cache;
    let data;
    let smSpec;
    const key = 'cache-key';

    const logger = mockLogger({app: 'persistent-state-machine-test'});

    function checkPSMLayout(psm, optData) {
        expect(psm).toBeTruthy();

        expect(psm.state).toEqual((optData && optData.currentState) || smSpec.init || 'none');

        expect(psm.context).toEqual({
            // allow passing optional data, elsewhere use default
            data: optData || data,
            cache,
            key,
            logger
        });

        expect(typeof psm.onAfterTransition).toEqual('function');
        expect(typeof psm.onPendingTransition).toEqual('function');
        expect(typeof psm.saveToCache).toEqual('function');
        expect(typeof psm.init).toEqual('function');
        expect(typeof psm.gogo).toEqual('function');
        expect(typeof psm.error).toEqual('function');
    }

    function shouldNotBeExecuted() {
        throw new Error('test failure enforced: this code should never be executed');
    }

    beforeEach(async () => {
        smSpec = {
            // init: 'start',
            transitions: [
                { name: 'init', from: 'none', to: 'start'},
                { name: 'gogo', from: 'start', to: 'end' },
                { name: 'error', from: '*', to: 'errored' }
            ],
            methods: {
                onGogo: async () => {
                    return new Promise( (resolved) => {
                        setTimeout((() => resolved(true)), 100);
                    } );
                },
                onError: () => {
                    // eslint-disable-next-line no-console
                    console.error('onError');
                }
            }
        };

        // test data
        data = { the: 'data' };

        cache = new Cache({
            cacheUrl: 'redis://dummy:1234',
            logger,
            unsubscribeTimeoutMs: 5000
        });
        // mock cache set & get
        cache.get = jest.fn(async () => data);
        cache.set = jest.fn(async () => 'cache set replies');

        await cache.connect();
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('module layout', () => {
        expect(typeof PSM.create).toEqual('function');
        expect(typeof PSM.loadFromCache).toEqual('function');
    });

    test('create', async () => {
        const psm = await PSM.create(data, cache, key, logger, smSpec);
        checkPSMLayout(psm);
        expect(psm.state).toEqual('none');
        await psm.init();
        expect(psm.state).toEqual('start');
    });

    describe('onPendingTransition', () => {
        it('should throw error if not `error` transition', async () => {
            const psm = await PSM.create(data, cache, key, logger, smSpec);
            checkPSMLayout(psm);

            psm.init();
            expect(() => psm.gogo()).toThrow('Transition \'gogo\' requested while another transition is in progress');

        });

        it('should not throw error if `error` transition called when `gogo` is pending', (done) => {
            PSM.create(data, cache, key, logger, smSpec).then((psm) => {
                checkPSMLayout(psm);

                psm.init()
                    .then(() => {
                        expect(psm.state).toEqual('start');
                        psm.gogo();
                        expect(psm.state).toEqual('end');
                        return Promise.resolve();
                    })
                    .then(() => psm.error())
                    .then(done)
                    .catch(shouldNotBeExecuted);
            });
        });
    });

    describe('loadFromCache', () => {
        it('should properly call cache.get, get expected data in `context.data` and setup state of machine', async () => {
            const dataFromCache = { this_is: 'data from cache', currentState: 'end'};
            cache.get = jest.fn( async () => dataFromCache);
            const psm = await PSM.loadFromCache(cache, key, logger, smSpec);
            checkPSMLayout(psm, dataFromCache);

            // to get value from cache proper key should be used
            expect(cache.get).toHaveBeenCalledWith(key);

            // check what has been stored in `context.data`
            expect(psm.context.data).toEqual(dataFromCache);

        });

        it('should throw when received invalid data from `cache.get`', async () => {
            cache.get = jest.fn( async () => null);
            try {
                await PSM.loadFromCache(cache, key, logger, smSpec);
                shouldNotBeExecuted();
            } catch (error) {
                expect(error.message).toEqual(`No cached data found for: ${key}`);
            }
        });

        it('should propagate error received from `cache.get`', async () => {
            cache.get = jest.fn( async () => { throw new Error('error from cache.get'); });
            expect(() => PSM.loadFromCache(cache, key, logger, smSpec))
                .rejects.toEqual(new Error('error from cache.get'));
        });
    });

    describe('saveToCache', () => {

        it('should rethrow error from cache.set', async () => {

            // mock to simulate throwing error
            cache.set = jest.fn(() => { throw new Error('error from cache.set'); });

            const psm = await PSM.create(data, cache, key, logger, smSpec);
            checkPSMLayout(psm);
            await psm.init();

            expect(() => psm.saveToCache())
                .rejects.toEqual(new Error('error from cache.set'));
        });
    });

});
