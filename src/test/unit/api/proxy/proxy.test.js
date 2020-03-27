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

jest.unmock('@mojaloop/sdk-standard-components');
jest.mock('request-promise-native');
jest.mock('redis');

const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const { createTestServers, destroyTestServers } = require('../utils');
const { createProxyTester } = require('./utils');

const defaultConfig = require('../../data/defaultConfig');

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
        testProxy('/sdk-path-test-1', '/switch-path-test-1', 'POST', {}, 200));

    test('should return success PUT response', async () =>
        testProxy('/sdk-path-test-1', '/switch-path-test-1', 'PUT', {}, 200));

    test('should return success GET response', async () =>
        testProxy('/sdk-path-test-1', '/switch-path-test-1', 'GET', {}, 200));

    test('should return error response', async () =>
        testProxy('/unknown-path-test-1', '/switch-path-test-1', 'POST', {}, 400));

    test('should forward by path regexp', async () =>
        testProxy('/sdk-path-test-2', '/switch-path-test-2', 'POST', {}, 200));

    test('should forward by query params', async () =>
        testProxy('/sdk-path-test-3', '/switch-path-test-3', 'POST',
            {test3key1: 'val1', test3key2: 'val2'}, 200));

    test('should forward by header params', async () =>
        testProxy('/sdk-path-test-4', '/switch-path-test-4', 'POST',
            {}, 200));
});
