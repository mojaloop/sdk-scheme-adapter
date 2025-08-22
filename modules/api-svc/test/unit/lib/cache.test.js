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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/

'use strict';

jest.mock('redis');

const randomUUID = require('@mojaloop/central-services-shared').Util.id({ type: 'ulid' });
const Cache = require('~/lib/cache');
const { logger } = require('~/lib/logger');

const createCache = async () => {
    const cache = new Cache({
        cacheUrl: 'redis://dummy:1234',
        logger,
        unsubscribeTimeoutMs: 5000,
    });
    await cache.connect();
    return cache;
};

describe('Cache Tests -->', () => {
    let cache;
    let dummyPubMessage;

    beforeEach(async () => {
        cache = await createCache();
        dummyPubMessage = JSON.parse(JSON.stringify({
            data: 12345,
            test: '98765'
        }));
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('Makes connections to redis server for cache operations', async () => {
        const cache = await createCache();
        expect(cache).not.toBeFalsy();
        await cache.disconnect();
    });


    test('Makes subscriber callbacks on the correct channels when messages arrive', async () => {
        const cache = await createCache();

        const msg1 = dummyPubMessage;

        // make the messages different
        const msg2 = JSON.parse(JSON.stringify(dummyPubMessage));
        msg2.abc = 'xyz';

        const chan1 = 'dummychannel1';
        const chan2 = 'dummychannel2';

        // create a promise that only gets resoled if the subscription gets the
        // correct message
        const cb1Promise = new Promise((resolve) => {
            const mockCb1 = jest.fn((cn, msg) => {
                expect(cn).toBe(chan1);

                const value = JSON.parse(msg);
                // check we got the expected message
                expect(value).toEqual(msg1);

                //resolve the promise
                resolve();
            });

            // subscribe to a ficticious channel
            return cache.subscribe(chan1, mockCb1).then(cbId1 => {
                // we should be the first callback registered (zero index)
                expect(cbId1).toBe(0);

                // now we have subscribed, inject a message.
                return cache.publish(chan1, msg1);
            });
        });

        // create a second promise that only gets resolved if the second subscription gets the
        // correct message
        const cb2Promise = new Promise((resolve) => {
            const mockCb2 = jest.fn((cn, msg) => {
                expect(cn).toBe(chan2);

                // check we got the expected message
                const value = JSON.parse(msg);
                expect(value).toEqual(msg2);

                //resolve the promise
                resolve();
            });

            // subscribe to a ficticious channel
            return cache.subscribe(chan2, mockCb2).then(cbId2 => {
                // we should be the second callback registered (zero index)
                expect(cbId2).toBe(1);

                // now we have subscribed, inject a message.
                return cache.publish(chan2, msg2);
            });
        });

        await Promise.all([cb1Promise, cb2Promise]);

        await cache.disconnect();
    });


    test('Unsubscribed callbacks do not get called when messages arrive', async () => {
        const cache = await createCache();
        const msg1 = dummyPubMessage;

        const chan = 'dummychannel1';

        // create a promise that only gets resoled if the subscription gets the
        // correct message
        await new Promise((resolve, reject) => {
            const mockCb1 = jest.fn((cn, msg) => {  // eslint-disable-line no-unused-vars
                //reject the outer promise if this func gets called!
                reject();
            });

            // subscribe to a ficticious channel
            return cache.subscribe(chan, mockCb1).then(cbId1 => {
                // we should be the first callback registered (zero index)
                expect(cbId1).toBe(0);

                // now we have subscribed we unsubscribe
                return cache.unsubscribe(chan, cbId1).then(() => {
                    // now we have unsubscribed, inject a message
                    cache.publish(chan, msg1);

                    // wait 3 seconds and if the callback has not been called we assume a pass
                    setTimeout(() => {
                        expect(mockCb1.mock.calls.length).toBe(0);
                        return resolve();
                    }, 3000);
                });
            });
        });
    });

    test('should subscribe to a channel and get one message', async () => {
        const channel = `ch-${randomUUID()}`;
        const message = { id: randomUUID() };
        const spyOnUnsubscribe = jest.spyOn(cache, 'unsubscribe');

        const subscribing = cache.subscribeToOneMessageWithTimer(channel);
        cache.publish(channel, message);
        const result = await subscribing;
        expect(result).toStrictEqual(message);
        expect(spyOnUnsubscribe).toHaveBeenCalledTimes(1);
    });

    test('should return SyntaxError when parsing incorrect JSON message', async () => {
        const channel = `ch-${randomUUID()}`;
        const message = '{ id: "123 }';
        const spyOnUnsubscribe = jest.spyOn(cache, 'unsubscribe');

        const subscribing = cache.subscribeToOneMessageWithTimer(channel);
        cache.publish(channel, message);
        const result = await subscribing;

        expect(result).toBeInstanceOf(SyntaxError);
        expect(spyOnUnsubscribe).toHaveBeenCalledTimes(1);
    });

    test('should return timeout error and unsubscribe if no message pushed to cache during subscribeTimeoutSeconds-period', async () => {
        cache.subscribeTimeoutSeconds = 0.1;
        const unsubscribeSpy = jest.spyOn(cache, 'unsubscribe');

        const result = await cache.subscribeToOneMessageWithTimer(randomUUID());
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe('Timeout error in subscribeToOneMessageWithTimer');
        expect(unsubscribeSpy).toHaveBeenCalled();
    });

    test('should return error if cache.subscribe() throws an error', async () => {
        const error = new Error('subscribe error');
        cache.subscribe = jest.fn(async () => { throw error; });
        const unsubscribeSpy = jest.spyOn(cache, 'unsubscribe');

        const result = await cache.subscribeToOneMessageWithTimer(randomUUID());
        expect(result).toEqual(error);
        expect(unsubscribeSpy).not.toHaveBeenCalled();
    });

    test('subscribeToOneMessageWithTimerNew should resolve with parsed message when received before timeout', async () => {
        const channel = `ch-${randomUUID()}`;
        const message = { id: randomUUID(), data: 'test-data' };
        const requestProcessingTimeoutSeconds = 1;

        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);
        
        // Simulate a message being published to the channel via EventEmitter
        setTimeout(() => {
            cache._channelEmitter.emit(channel, JSON.stringify(message));
        }, 100);

        const result = await subscribing;
        expect(result).toStrictEqual(message);
    });

    test('subscribeToOneMessageWithTimerNew should resolve with unparsed message when needParse is false', async () => {
        const channel = `ch-${randomUUID()}`;
        const message = 'raw-string-message';
        const requestProcessingTimeoutSeconds = 1;

        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds, false);
        
        // Simulate a message being published to the channel via EventEmitter
        setTimeout(() => {
            cache._channelEmitter.emit(channel, message);
        }, 100);

        const result = await subscribing;
        expect(result).toBe(message);
    });

    test('subscribeToOneMessageWithTimerNew should reject with TimeoutError when no message received within timeout', async () => {
        const channel = `ch-${randomUUID()}`;
        const requestProcessingTimeoutSeconds = 0.1; // 100ms timeout

        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);

        await expect(subscribing).rejects.toThrow(`Subscription timeout after ${requestProcessingTimeoutSeconds}s`);
        
        // Test that it's a TimeoutError instance
        try {
            await subscribing;
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error.constructor.name).toBe('TimeoutError');
        }
    });

    test('subscribeToOneMessageWithTimerNew should reject when JSON parsing fails', async () => {
        const channel = `ch-${randomUUID()}`;
        const invalidJson = '{ invalid json }';
        const requestProcessingTimeoutSeconds = 1;

        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds, true);
        
        // Simulate a message with invalid JSON
        setTimeout(() => {
            cache._channelEmitter.emit(channel, invalidJson);
        }, 100);

        await expect(subscribing).rejects.toThrow();
    });

    test('subscribeToOneMessageWithTimerNew should handle multiple subscribers to same channel', async () => {
        const channel1 = `ch-${randomUUID()}`;
        const channel2 = `ch-${randomUUID()}`;
        const message1 = { id: 'msg1', data: 'test1' };
        const message2 = { id: 'msg2', data: 'test2' };
        const requestProcessingTimeoutSeconds = 1;

        // Create two subscriptions to different channels to avoid interference
        const subscribing1 = cache.subscribeToOneMessageWithTimerNew(channel1, requestProcessingTimeoutSeconds);
        const subscribing2 = cache.subscribeToOneMessageWithTimerNew(channel2, requestProcessingTimeoutSeconds);
        
        // Emit messages to each channel separately
        setTimeout(() => {
            cache._channelEmitter.emit(channel1, JSON.stringify(message1));
            cache._channelEmitter.emit(channel2, JSON.stringify(message2));
        }, 100);

        // Both should resolve with their respective messages
        const results = await Promise.all([subscribing1, subscribing2]);
        expect(results[0]).toStrictEqual(message1);
        expect(results[1]).toStrictEqual(message2);
    });

    test('subscribeToOneMessageWithTimerNew should handle concurrent subscribers to same channel (party lookup scenario)', async () => {
        const channel = `party-lookup-${randomUUID()}`;
        const partyResponse = { party: { partyIdInfo: { partyIdType: 'MSISDN', partyIdentifier: '123456789' }}};
        const requestProcessingTimeoutSeconds = 1;

        // Create multiple concurrent subscriptions to same channel (simulating concurrent party lookups)
        const subscribing1 = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);
        const subscribing2 = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);
        const subscribing3 = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);
        
        // Simulate a single party response that should resolve all subscribers
        setTimeout(() => {
            cache._channelEmitter.emit(channel, JSON.stringify(partyResponse));
        }, 100);

        // All subscribers should resolve with the same party response
        const results = await Promise.all([subscribing1, subscribing2, subscribing3]);
        expect(results[0]).toStrictEqual(partyResponse);
        expect(results[1]).toStrictEqual(partyResponse);
        expect(results[2]).toStrictEqual(partyResponse);
    });

    test('subscribeToOneMessageWithTimerNew should clean up resources on timeout', async () => {
        const channel = `ch-${randomUUID()}`;
        const requestProcessingTimeoutSeconds = 0.1;
        
        const removeListenerSpy = jest.spyOn(cache._channelEmitter, 'removeListener');
        
        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);

        await expect(subscribing).rejects.toThrow(`Subscription timeout after ${requestProcessingTimeoutSeconds}s`);
        
        // Test that it's a TimeoutError instance
        try {
            await subscribing;
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error.constructor.name).toBe('TimeoutError');
        }
        
        // Verify cleanup was called
        expect(removeListenerSpy).toHaveBeenCalledWith(channel, expect.any(Function));
        
        removeListenerSpy.mockRestore();
    });

    test('subscribeToOneMessageWithTimerNew should reject when subscription fails', async () => {
        const channel = `ch-${randomUUID()}`;
        const requestProcessingTimeoutSeconds = 1;
        const subscriptionError = new Error('subscription failed');

        // Mock the _subscriptionClient.subscribe to reject
        const originalSubscribe = cache._subscriptionClient.subscribe;
        cache._subscriptionClient.subscribe = jest.fn().mockRejectedValue(subscriptionError);

        const subscribing = cache.subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds);

        await expect(subscribing).rejects.toThrow('subscription failed');
        
        // Restore original method
        cache._subscriptionClient.subscribe = originalSubscribe;
    });
});
