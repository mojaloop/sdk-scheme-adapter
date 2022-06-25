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

const Cache = require('~/lib/cache');
const { Logger } = require('@mojaloop/sdk-standard-components');

const createCache = async() => {
    const logger = new Logger.Logger({ context: { app: 'model-unit-tests-cache' }, stringify: () => '' });
    const cache = new Cache({
        host: 'dummyhost',
        port: 1234,
        logger,
    });
    await cache.connect();
    return cache;
};

describe('Cache', () => {
    let dummyPubMessage;

    beforeEach(() => {
        dummyPubMessage = JSON.parse(JSON.stringify({
            data: 12345,
            test: '98765'
        }));
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
                cache.publish(chan1, msg1);
            });
        });

        // create a second promise that only gets resoled if the second subscription gets the
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
                cache.publish(chan2, msg2);
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
        await cache.disconnect();
    });
});
