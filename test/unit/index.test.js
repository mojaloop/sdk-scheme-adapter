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

const { Logger } = require('@mojaloop/sdk-standard-components');
const defaultConfig = require('./data/defaultConfig');

jest.mock('dotenv', () => ({
    config: jest.fn()
}));

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_HOST = '172.17.0.2';
process.env.CACHE_PORT = '6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';

const index = require('~/index.js');

describe('index.js', () => {
    test('WSO2 error events in OutboundServer propagate to top-level server', () => {
        const logger = new Logger.Logger({ stringify: () => '' });
        const svr = new index.Server(defaultConfig, logger);
        const cb = jest.fn();
        svr.on('error', cb);
        svr.outboundServer._api._wso2.auth.emit('error', 'msg');
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test('WSO2 error events in InboundServer propagate to top-level server', () => {
        const logger = new Logger.Logger({ stringify: () => '' });
        const svr = new index.Server(defaultConfig, logger);
        const cb = jest.fn();
        svr.on('error', cb);
        svr.inboundServer._api._wso2.auth.emit('error', 'msg');
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test('Exports expected modules', () => {
        expect(typeof(index.Server)).toBe('function');
        expect(typeof(index.InboundServerMiddleware)).toBe('object');
        expect(typeof(index.OutboundServerMiddleware)).toBe('object');
        expect(typeof(index.Router)).toBe('function');
        expect(typeof(index.Validate)).toBe('function');
        expect(typeof(index.Cache)).toBe('function');
    });
});
