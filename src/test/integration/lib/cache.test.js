'use strict';

jest.dontMock('redis');

const Cache = require('@internal/cache');
const { Logger, Transports } = require('@internal/log');

const defaultCacheConfig = {
    host: 'redis',
    port: 6379,
    logger: null,
    shouldExpire: false,
    expirySeconds: 600
};

const createCache = async (config) => {
    const transports = await Promise.all([Transports.consoleDir()]);
    config.logger = new Logger({
        context: {
            app: 'mojaloop-sdk-inboundCache'
        },
        space: 4,
        transports
    });
    const cache = new Cache(config);
    await cache.connect();

    return cache;
};

describe('Cache', () => {
    
    // beforeAll(async () => {
    //     createCache();
    // });

    test('Sets and retrieves an object in the cache', async () => {
        // Arrange
        console.log('hello there!');
        const cache = await createCache(defaultCacheConfig);
        const value = JSON.stringify({test: true});

        // Act
        await cache.set('keyA', value);
        const result = await cache.get('keyA');
        
        // Assert
        expect(result).toBe(value);
    });

    // test('expires an object from the cache ')

});