/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the 'License') and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Initial contribution
 --------------------
 The initial functionality and code base was donated by the Mowali project working in conjunction with MTN and Orange as service provides.
 * Project: Mowali

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Lewis Daly <lewisd@crosslaketech.com>
 --------------
 ******/
'use strict';

jest.dontMock('redis');

const Cache = require('@internal/cache');
const { Logger } = require('@internal/log');

const defaultCacheConfig = {
    host: 'redis',
    port: 6379,
    logger: null,
    shouldExpire: false,
    expirySeconds: 600
};

const createCache = async (config) => {
    const transports = [];
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

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

let cache;
describe('Cache', () => {
    test('Sets and retrieves an object in the cache', async () => {
        // Arrange
        cache = await createCache(defaultCacheConfig);
        const value = {test: true};

        // Act
        await cache.set('keyA', JSON.stringify(value));
        const result = await cache.get('keyA');
        
        // Assert
        expect(result).toStrictEqual(value);
    });

    test('expires an object from the cache ', async () => {
        // Arrange
        const expiryConfig = {
            ...defaultCacheConfig,
            shouldExpire: true,
            expirySeconds: 2
        };
        cache = await createCache(expiryConfig);
        const value = { test: true };

        // Act
        await cache.set('keyA', JSON.stringify(value));
        await sleep(3 * 1000);
        const result = await cache.get('keyA');

        // Assert
        expect(result).toBe(null);
    });

    test('object is still in the cache if accessed before expiry', async () => {
        // Arrange
        const expiryConfig = {
            ...defaultCacheConfig,
            shouldExpire: true,
            expirySeconds: 4
        };
        cache = await createCache(expiryConfig);
        const value = { test: true };

        // Act
        await cache.set('keyA', JSON.stringify(value));
        await sleep(3 * 1000);
        const result = await cache.get('keyA');

        // Assert
        expect(result).toStrictEqual(value);
    });
});