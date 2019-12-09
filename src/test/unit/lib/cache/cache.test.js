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


jest.mock('redis');

const Cache = require('@internal/cache');
jest.unmock('@internal/cache');


const defaultConfig = {
    host: 'dummyhost',
    port: 1234,
    logger: console
};


const dummyPubMessageTemplate = {
    data: 12345,
    test: '98765'
};


const createCache = async() => {
    const cache = new Cache(defaultConfig);
    await cache.connect();
    return cache;
};


let dummyPubMessage;


describe('Cache', () => {

    beforeEach(() => {
        dummyPubMessage = JSON.parse(JSON.stringify(dummyPubMessageTemplate));
    });

    test('Makes connections to redis server for cache operations', async () => {
        const cache = await createCache();
        expect(cache).not.toBeFalsy();

        // the cache should have opened a general connection
        expect(cache.client).not.toBeFalsy();

        // the cache should have opened a subscription connection
        expect(cache.subscriptionClient).not.toBeFalsy();
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
            const mockCb1 = jest.fn((cn, msg, subId) => {
                expect(cn).toBe(chan1);
                console.log(`callback on subId: ${subId}`);

                // check we got the expected message
                expect(msg).toBe(msg1);

                //resolve the promise
                resolve();
            });

            // subscribe to a ficticious channel
            return cache.subscribe(chan1, mockCb1).then(cbId1 => {
                // we should be the first callback registered (zero index)
                expect(cbId1).toBe(0);

                // now we have subscribed, inject a message.
                cache.subscriptionClient.emitMessage('message', chan1, msg1);
            });
        });

        // create a second promise that only gets resoled if the second subscription gets the
        // correct message
        const cb2Promise = new Promise((resolve) => {
            const mockCb2 = jest.fn((cn, msg, subId) => {
                expect(cn).toBe(chan2);
                console.log(`callback on subId: ${subId}`);

                // check we got the expected message
                expect(msg).toBe(msg2);

                //resolve the promise
                resolve();
            });

            // subscribe to a ficticious channel
            return cache.subscribe(chan2, mockCb2).then(cbId2 => {
                // we should be the second callback registered (zero index)
                expect(cbId2).toBe(1);

                // now we have subscribed, inject a message.
                cache.subscriptionClient.emitMessage('message', chan2, msg2);
            });
        });

        return Promise.all([cb1Promise, cb2Promise]);
    });


    test('Unsubscribed callbacks do not get called when messages arrive', async () => {
        const cache = await createCache();
        const msg1 = dummyPubMessage;

        const chan = 'dummychannel1';

        // create a promise that only gets resoled if the subscription gets the
        // correct message
        const cb1Promise = new Promise((resolve, reject) => {
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
                    cache.subscriptionClient.emitMessage('message', 'dummychannel1', msg1);

                    // wait 3 seconds and if the callback has not been called we assume a pass
                    setTimeout(() => {
                        expect(mockCb1.mock.calls.length).toBe(0);
                        expect(cache.callbacks[chan]).toBe(undefined);
                        return resolve();
                    }, 3000);
                });                
            });
        });

        return cb1Promise;
    });
});
