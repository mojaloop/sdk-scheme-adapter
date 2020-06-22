/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';

const Cache = jest.createMockFromModule('@internal/cache');

const PSM = require('@internal/model').PersistentStateMachine;
const { Logger, Transports } = require('@internal/log');


describe('PersistentStateMachine', () => {
    let logger;
    let cache;
    let data;
    let smSpec;
    const key = 'cache-key';

    function checkPSMLayout(psm, optData) {
        expect(psm).toBeTruthy();
        
        expect(psm.state).toEqual(smSpec.init || 'none');

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

    beforeAll(async () => {
        const logTransports = await Promise.all([Transports.consoleDir()]);
        logger = new Logger({ context: { app: 'persistent-state-machine-tests' }, space: 4, transports: logTransports });
    });

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
                    console.error('onGogo');
                    return new Promise( (resolved) => {
                        setTimeout(() => {
                            console.error('onGogo: resolved');
                            resolved(true);
                        }, 100);
                    } );
                },
                onError: () => {
                    console.error('onError');
                }
            }
        };

        // test data
        data = { the: 'data' };
        
        cache = new Cache({
            host: 'dummycachehost',
            port: 1234,
            logger,
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

            try {
                psm.init();
                await psm.gogo();
                shouldNotBeExecuted();
            } catch (error) {
                expect(error.message).toEqual('Transition requested while another transition is in progress: gogo');
            }
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
                    .then(() => {
                        return psm.error();

                    })
                    .then(() => {
                        done();
                    })
                    .catch(error => {
                        console.error('error', error);
                        shouldNotBeExecuted();
                    });
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

            // expect(psm.state).toEqual('end');
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
            try {
                await PSM.loadFromCache(cache, key, logger, smSpec);
                shouldNotBeExecuted();
            } catch (error) {
                expect(error.message).toEqual('error from cache.get');
            }
        });
    });

    describe('saveToCache', () => {
        it('should be called after transition', async () => {
            const psm = await PSM.create(data, cache, key, logger, smSpec);
            checkPSMLayout(psm);
            
            // make transition from none -> start
            await psm.init();

            // check state
            expect(psm.state).toEqual('start');

            // check state propagation to data
            expect(psm.context.data.currentState).toEqual('start');
            
            // make transition from start -> end
            await psm.gogo();

            // check state change
            expect(psm.state).toEqual('end');
            
            // check what has been stored in cache 
            expect(cache.set).toBeCalledWith(key, psm.context.data);
            
            // check state propagation to `context.data`
            expect(psm.context.data.currentState).toEqual('end');
        });

        it('should rethrow error from cache.set', async () => {
            
            // mock to simulate throwing error
            cache.set = jest.fn(() => { throw new Error('error from cache.set'); });
            
            const psm = await PSM.create(data, cache, key, logger, smSpec);
            checkPSMLayout(psm);

            // transition `init` should encounter exception when saving `context.data` 
            try {
                await psm.init();
                shouldNotBeExecuted();
            } catch (error) {
                // check if got expected error
                expect(error.message).toEqual('error from cache.set');
            }
            
        });
    });

});