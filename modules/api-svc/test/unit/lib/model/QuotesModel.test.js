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

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');

const uuid = require('@mojaloop/central-services-shared').Util.id({ type: 'ulid' });
const Model = require('~/lib/model').QuotesModel;
const PSM = require('~/lib/model/common').PersistentStateMachine;
const { SDKStateEnum } = require('~/lib/model/common');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const defaultConfig = require('./data/defaultConfig');
const mockLogger = require('../../mockLogger');
const deferredJob = require('~/lib/model/lib').deferredJob;
const pt = require('promise-timeout');
const putQuotesResponse = require('./data/putQuotesResponse.json');

describe('QuotesModel', () => {
    let cacheKey;
    let data;
    let modelConfig;

    const subId = uuid();
    let handler = null;
    beforeEach(async () => {

        modelConfig = {
            logger: mockLogger({app: 'QuotesModel-test'}),

            // there is no need to mock redis but only Cache
            cache: {
                get: jest.fn(() => Promise.resolve(data)),
                set: jest.fn(() => Promise.resolve),

                // mock subscription and store handler
                subscribe: jest.fn(async (channel, h) => {
                    handler = jest.fn(h);
                    return subId;
                }),

                // mock publish and call stored handler
                publish: jest.fn(async (channel, message) => await handler(channel, message, subId)),

                unsubscribe: jest.fn(() => Promise.resolve())
            },
            ...defaultConfig
        };
        data = {
            the: 'mocked data'
        };

        cacheKey = `key-quotes-${uuid()}`;
    });

    describe('create', () => {
        test('proper creation of model', async () => {
            const model = await Model.create(data, cacheKey, modelConfig);

            expect(model.state).toBe('start');

            // model's methods layout
            const methods = [
                'run',
                'getResponse',
                'onRequestAction'
            ];

            methods.forEach((method) => expect(typeof model[method]).toEqual('function'));
        });
    });

    describe('getResponse', () => {

        it('should remap currentState', async () => {
            const model = await Model.create(data, cacheKey, modelConfig);
            const states = model.allStates();
            // should remap for all states except 'init' and 'none'
            states.filter((s) => s !== 'init' && s !== 'none').forEach((state) => {
                model.context.data.currentState = state;
                const result = model.getResponse();
                expect(result.currentState).toEqual(Model.mapCurrentState[state]);
            });

        });

        it('should handle unexpected state', async() => {
            const model = await Model.create(data, cacheKey, modelConfig);

            // simulate lack of state by undefined property
            delete model.context.data.currentState;

            const resp = model.getResponse();
            expect(resp.currentState).toEqual(Model.mapCurrentState.errored);

            // ensure that we log the problem properly
            expect(modelConfig.logger.error).toHaveBeenCalledWith(`QuotesModel model response being returned from an unexpected state: ${undefined}. Returning ERROR_OCCURRED state`);
        });
    });

    describe('channelName', () => {
        it('should validate input', () => {
            expect(Model.channelName({})).toEqual('quotes-undefined');
        });

        it('should generate proper channel name', () => {
            const quoteId = uuid();
            expect(Model.channelName({ quoteId })).toEqual(`quotes-${quoteId}`);
        });

    });

    describe('generateKey', () => {
        it('should generate proper cache key', () => {
            const quoteId = uuid();
            expect(Model.generateKey({ quoteId })).toEqual(`key-${Model.channelName({ quoteId })}`);
        });

        it('should handle lack of quoteId param', () => {
            expect(() => Model.generateKey({ })).toThrowError(new Error('QuotesModel args requires \'quoteId\' is nonempty string and mandatory property'));
        });

    });

    describe('onRequestAction', () => {

        it('should implement happy flow', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };
            const channel = Model.channelName({ quoteId });
            const model = await Model.create(data, cacheKey, modelConfig);
            const { cache } = model.context;
            // mock workflow execution which is tested in separate case
            model.run = jest.fn(() => Promise.resolve());

            const message = {
                body: { ...putQuotesResponse },
                headers: {}
            };

            const onRequestActionPromise = new Promise((resolve, reject) => {
                // manually invoke transition handler
                model.onRequestAction(model.fsm, { quoteId, fspId, quote })
                    .then(() => {
                        // subscribe should be called only once
                        expect(cache.subscribe).toHaveBeenCalledTimes(1);

                        // subscribe should be done to proper notificationChannel
                        expect(cache.subscribe.mock.calls[0][0]).toEqual(channel);

                        // check invocation of request.getParties
                        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledWith(quote, fspId);

                        // check that this.context.data is updated
                        expect(model.context.data).toEqual({
                            quotes: { ...message },
                            // current state will be updated by onAfterTransition which isn't called
                            // when manual invocation of transition handler happens
                            currentState: 'start'
                        });
                        // handler should be called only once
                        expect(handler).toHaveBeenCalledTimes(1);

                        // handler should unsubscribe from notification channel
                        expect(cache.unsubscribe).toHaveBeenCalledTimes(1);
                        expect(cache.unsubscribe).toHaveBeenCalledWith(channel, subId);
                        resolve();
                    }).catch((err) => { reject(err); } );
            });

            // ensure handler wasn't called before publishing the message
            expect(handler).not.toHaveBeenCalled();

            // ensure that cache.unsubscribe does not happened before fire the message
            expect(cache.unsubscribe).not.toHaveBeenCalled();

            // fire publication with given message
            const df = deferredJob(cache, channel);
            setImmediate(() => df.trigger(message));

            // wait for onRequestAction
            await onRequestActionPromise;
        });

        it('should handle timeouts', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };
            const channel = Model.channelName({ quoteId });

            const model = await Model.create(data, cacheKey, modelConfig);
            const { cache } = model.context;
            // mock workflow execution which is tested in separate case
            model.run = jest.fn(() => Promise.resolve());

            const message = {
                body: { ...putQuotesResponse },
                headers: {}
            };

            const onRequestActionPromise = new Promise((resolve, reject) => {
                // manually invoke transition handler
                model.onRequestAction(model.fsm, { quoteId, fspId, quote })
                    .then(() => reject())
                    .catch((err) => {
                        // subscribe should be called only once
                        expect(err instanceof pt.TimeoutError).toBeTruthy();

                        // subscribe should be done to proper notificationChannel
                        expect(cache.subscribe.mock.calls[0][0]).toEqual(channel);

                        // check invocation of request.getParties
                        expect(MojaloopRequests.__postQuotes).toHaveBeenCalledWith(quote, fspId);

                        // handler should be called only once
                        expect(handler).toHaveBeenCalledTimes(0);

                        // handler should unsubscribe from notification channel
                        expect(cache.unsubscribe).toHaveBeenCalledTimes(1);
                        expect(cache.unsubscribe).toHaveBeenCalledWith(channel, subId);
                        resolve();
                    });
            });

            // ensure handler wasn't called before publishing the message
            expect(handler).not.toHaveBeenCalled();

            // ensure that cache.unsubscribe does not happened before fire the message
            expect(cache.unsubscribe).not.toHaveBeenCalled();

            // fire publication with given message
            const df = deferredJob(cache, channel);

            setTimeout(
                () => { df.trigger(message); },
                // ensure that publication will be far long after timeout should be auto triggered
                (modelConfig.requestProcessingTimeoutSeconds+1)*1000
            );

            // wait for onRequestAction
            await onRequestActionPromise;
        });

        it('should unsubscribe from cache in case when error happens in workflow run', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };
            const channel = Model.channelName({ quoteId });
            const model = await Model.create(data, cacheKey, modelConfig);
            const { cache } = model.context;

            // fire publication to channel with invalid message
            // should throw the exception from JSON.parse
            const df = deferredJob(cache, channel);
            setImmediate(() => df.trigger(undefined));

            // invoke transition handler
            try {
                await model.onRequestAction(model.fsm, { quoteId, fspId, quote });
                throw new Error('this point should not be reached');
            } catch (err) {
                expect(err).toBeInstanceOf(SyntaxError);
                expect(cache.unsubscribe).toHaveBeenCalledTimes(1);
                expect(cache.unsubscribe).toHaveBeenCalledWith(channel, subId);
            }
        });

        it('should unsubscribe from cache in case when error happens Mojaloop requests', async () => {
            // simulate error
            MojaloopRequests.__postQuotes = jest.fn(() => Promise.reject('postQuotes failed'));
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };
            const channel = Model.channelName({ quoteId });
            const model = await Model.create(data, cacheKey, modelConfig);
            const { cache } = model.context;

            let theError = null;
            // invoke transition handler
            try {
                await model.onRequestAction(model.fsm, { quoteId, fspId, quote });
                throw new Error('this point should not be reached');
            } catch (error) {
                theError = error;
                expect(theError).toEqual('postQuotes failed');
                // handler should unsubscribe from notification channel
                expect(cache.unsubscribe).toHaveBeenCalledTimes(1);
                expect(cache.unsubscribe).toHaveBeenCalledWith(channel, subId);
            }
        });

    });

    describe('run workflow', () => {
        it('start', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };

            const model = await Model.create(data, cacheKey, modelConfig);

            model.requestAction = jest.fn();
            model.getResponse = jest.fn(() => Promise.resolve({the: 'response'}));

            model.context.data.currentState = 'start';
            const result = await model.run({ quoteId, fspId, quote });
            expect(result).toEqual({the: 'response'});
            expect(model.requestAction).toHaveBeenCalledTimes(1);
            expect(model.getResponse).toHaveBeenCalledTimes(1);
            const lastLogCalls = model.context.logger.debug.mock.calls.slice(-3)
            expect(lastLogCalls).toEqual([
                ['State machine transitioned \'init\': none -> start'],
                ['Action called successfully'],
                [`Persisted model in cache: ${cacheKey}`],
            ]);
        });
        it('succeeded', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };

            const model = await Model.create(data, cacheKey, modelConfig);

            model.getResponse = jest.fn(() => Promise.resolve({the: 'response'}));

            model.context.data.currentState = 'succeeded';
            const result = await model.run({ quoteId, fspId, quote });

            expect(result).toEqual({the: 'response'});
            expect(model.getResponse).toHaveBeenCalledTimes(1);
            expect(model.context.logger.debug).toHaveBeenCalledWith('Action called successfully');
        });

        it('errored', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };

            const model = await Model.create(data, cacheKey, modelConfig);

            model.getResponse = jest.fn(() => Promise.resolve({the: 'response'}));

            model.context.data.currentState = 'errored';
            const result = await model.run({ quoteId, fspId, quote});

            expect(result).toBeFalsy();
            expect(model.getResponse).not.toHaveBeenCalled();
            expect(model.context.logger.error).toHaveBeenCalledWith('State machine in errored state');
        });

        it('handling errors', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };

            const model = await Model.create(data, cacheKey, modelConfig);

            model.requestAction = jest.fn(() => { throw new Error('mocked error'); });

            model.context.data.currentState = 'start';

            try {
                await model.run({ quoteId, fspId, quote });
                throw new Error('this point should not be reached');
            } catch (err) {
                expect(model.context.data.currentState).toEqual('errored');
                expect(err.requestActionState).toEqual( {
                    ...data,
                    currentState: SDKStateEnum.ERROR_OCCURRED,
                });
            }
        });

        it('should handle errors', async () => {
            const quoteId = uuid();
            const fspId = uuid();
            // our code takes care only about 'quoteId' property
            const quote = { quoteId };

            const model = await Model.create(data, cacheKey, modelConfig);

            model.requestAction = jest.fn(() => {
                const err = new Error('requestAction failed');
                err.requestActionState = 'some';
                return Promise.reject(err);
            });
            model.error = jest.fn();
            model.context.data.currentState = 'start';

            let theError = null;
            try {
                await model.run({ quoteId, fspId, quote });
                throw new Error('this point should not be reached');
            } catch(error) {
                theError = error;
            }
            // check propagation of original error
            expect(theError.message).toEqual('requestAction failed');

            // ensure we start transition to errored state
            expect(model.error).toHaveBeenCalledTimes(1);
        });

        it('should handle input validation for lack of quoteId param', async () => {
            const model = await Model.create(data, cacheKey, modelConfig);

            expect(() => model.run({}))
                .rejects.toEqual(
                    new Error('QuotesModel args requires \'quoteId\' is nonempty string and mandatory property')
                );
        });

        it('should handle input validation for not quoteId & quote.quoteId be in sync', async () => {
            const quoteId = uuid();
            const model = await Model.create(data, cacheKey, modelConfig);

            expect(() => model.run({quoteId, quote: { quoteId: uuid()}}))
                .rejects.toEqual(
                    new Error('QuotesModel args requires properties \'quote.quoteId\' and \'quoteId\' to be the equal in value')
                );
        });

        it('should handle input validation for fspId param', async () => {
            const quoteId = uuid();
            const model = await Model.create(data, cacheKey, modelConfig);

            expect(() => model.run({quoteId, fspId:'' }))
                .rejects.toEqual(
                    new Error('QuotesModel args requires \'fspId\' to be nonempty string')
                );
        });

    });

    describe('loadFromCache', () => {
        test('should use PSM.loadFromCache properly', async () => {
            const spyLoadFromCache = jest.spyOn(PSM, 'loadFromCache');
            const key = uuid();

            // act
            const model = await Model.loadFromCache(key, modelConfig);

            // assert
            // check does model is proper
            expect(typeof model.requestAction).toEqual('function');

            // check how cache.get has been called
            expect(modelConfig.cache.get).toHaveBeenCalledWith(key);

            // check how loadFromCache from parent PSM module was used
            expect(spyLoadFromCache).toHaveBeenCalledTimes(1);
            expect(spyLoadFromCache).toHaveBeenCalledWith(
                modelConfig.cache,
                key,
                modelConfig.logger,
                expect.anything(),
                expect.anything()
            );
        });
    });
});
