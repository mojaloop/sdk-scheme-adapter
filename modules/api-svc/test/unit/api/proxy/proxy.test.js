/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

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
