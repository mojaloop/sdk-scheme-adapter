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

jest.unmock('@mojaloop/sdk-standard-components');
jest.mock('redis');

const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const { createTestServers, destroyTestServers } = require('../utils');
const { createProxyTester } = require('./utils');

const defaultConfig = require('../../data/defaultConfig');

defaultConfig.peerEndpoint = `${defaultConfig.peerEndpoint}/abc/def`;

describe('Proxy', () => {
    let serversInfo;
    let testProxy;

    const configPath = path.join(__dirname, 'data', 'proxyConfig.yaml');
    const proxyConfig = yaml.load(fs.readFileSync(configPath));

    beforeEach(async () => {
        serversInfo = await createTestServers({
            ...defaultConfig,
            proxyConfig,
        });
        testProxy = createProxyTester({
            reqOutbound: serversInfo.reqOutbound,
        });
    });

    afterEach(async () => {
        await destroyTestServers(serversInfo);
    });

    test('should return success POST response', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-1',
            method: 'POST',
            query: {},
            headers: {},
            shouldForward: true,
        }));

    test('should return success PUT response', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-1',
            method: 'PUT',
            query: {},
            headers: {},
            shouldForward: true,
        }));

    test('should return success GET response', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-1',
            method: 'GET',
            query: {},
            headers: {},
            shouldForward: true,
        }));

    test('should return error response', async () =>
        testProxy({
            sdkUrlPath: '/unknown-sdk-path-test-1',
            method: 'POST',
            query: {},
            headers: {},
            shouldForward: false,
        }));

    test('should forward by path regexp', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-2',
            method: 'POST',
            query: {},
            headers: {},
            shouldForward: true,
        }));

    test('should forward by query params', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test',
            method: 'POST',
            query: { testParam3: 'testValue3' },
            headers: {},
            shouldForward: true,
        }));

    test('should not forward by query params', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test',
            method: 'POST',
            query: { testParam3: 'testValue4' },
            headers: {},
            shouldForward: false,
        }));

    test('should forward by header params', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test',
            method: 'POST',
            query: { },
            headers: {
                customHeader2: 'customValue2',
                customHeader3: 'other value'
            },
            shouldForward: true,
        }));

    test('should not forward by header params', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test',
            method: 'POST',
            query: { },
            headers: {
                customHeader2: 'customValue2',
            },
            shouldForward: false,
        }));

    test('should forward by header values', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test',
            method: 'POST',
            query: { },
            headers: {
                someHeader1: 'someCustomValue',
                someHeader2: 'customValue5',
            },
            shouldForward: true,
        }));

    test('should forward using multi-match rule (path and headers)', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-8',
            method: 'POST',
            query: { },
            headers: {
                requiredName: 'yes',
            },
            shouldForward: true,
        }));

    test('should not forward using multi-match rule (wrong headers)', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-8',
            method: 'POST',
            query: { },
            headers: {
                requiredName: 'no',
            },
            shouldForward: false,
        }));

    test('should forward using multi-match rule (query)', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-8',
            method: 'POST',
            query: { customQkey81: 'some qval' },
            headers: {
                requiredName: 'no',
            },
            shouldForward: true,
        }));

    test('should forward using multi-match rule (headers)', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-8',
            method: 'POST',
            query: { customQkey81Unknown: 'some qval' },
            headers: {
                requiredName: 'no',
                SomeHKEY82: 'some val',
                'content-type': 'application/json',
            },
            shouldForward: true,
        }));

    test('should handle binary response', async () =>
        testProxy({
            sdkUrlPath: '/sdk-path-test-8',
            method: 'POST',
            query: { customQkey81Unknown: 'some qval' },
            headers: {
                requiredName: 'no',
                SomeHKEY82: 'some val',
                'content-type': 'application/json',
            },
            shouldForward: true,
            binary: true,
        }));
});
