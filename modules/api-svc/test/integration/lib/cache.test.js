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

 * Crosslake
 - Lewis Daly <lewisd@crosslaketech.com>
 --------------
 ******/
'use strict';

jest.dontMock('redis');

const Cache = require('~/lib/cache');
const { logger } = require('~/lib/logger');
const env = require('../testEnv');

const defaultCacheConfig = {
    cacheUrl: env.redisUrl,
    logger: null
};

const createCache = async (config) => {
    config.logger = logger.push({ context: { app: 'mojaloop-sdk-inboundCache' } });
    const cache = new Cache(config);
    await cache.connect();

    return cache;
};

describe('Cache', () => {
    let cache;

    beforeEach(async () => {
        cache = await createCache(defaultCacheConfig);
    });

    afterEach(async () => {
        await cache.disconnect();
    });

    test('Sets and retrieves an object in the cache', async () => {
        // Arrange
        const value = {test: true};

        // Act
        await cache.set('keyA', JSON.stringify(value));
        const result = await cache.get('keyA');

        // Assert
        expect(result).toStrictEqual(value);
    });
});
