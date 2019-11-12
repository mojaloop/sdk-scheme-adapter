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

const Readable = require('stream').Readable;
const defaultConfig = require('./data/defaultConfig');

// we use a mock koa (from our __mocks__ directory)
jest.mock('koa');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const http = require('http');
const https = require('https');

const OutboundServer = require('../../InboundServer');

class DummyRequest {
    constructor(opts) {
        this.path = opts.path;
        this.method = opts.method;
        this.res = {};
        this.request = {
            headers: opts.headers,
            path: opts.path,
            method: opts.method
        };
        this.response = {};
        this.state = {};

        this.req = new Readable();
        this.req.headers = opts.headers;
        this.req._read = () => {};
        this.req.push(JSON.stringify(opts.body));
        this.req.push(null);
    }
}

describe('Outbound Server mTLS test', () => {
    let defConfig;
    let httpServerSpy;
    let httpsServerSpy;

    beforeAll(() => {
        httpServerSpy = jest.spyOn(http, 'createServer');
        httpsServerSpy = jest.spyOn(https, 'createServer');
    });

    beforeEach(() => {
        defConfig = JSON.parse(JSON.stringify(defaultConfig));
        httpServerSpy.mockClear();
        httpsServerSpy.mockClear();
    });

    afterAll(() => {
        httpServerSpy.mockRestore();
        httpsServerSpy.mockRestore();
    });

    async function testTlsServer(enableTls) {
        defConfig.tls.outbound.mutualTLS.enabled = enableTls;
        const server = new OutboundServer(defConfig);
        await server.setupApi();
        if (enableTls) {
            expect(httpsServerSpy).toHaveBeenCalled();
            expect(httpServerSpy).not.toHaveBeenCalled();
        } else {
            expect(httpsServerSpy).not.toHaveBeenCalled();
            expect(httpServerSpy).toHaveBeenCalled();
        }
    }

    test('Outbound server should use HTTPS if outbound mTLS enabled', () =>
        testTlsServer(true));

    test('Outbound server should use HTTP if outbound mTLS disabled', () =>
        testTlsServer(false));
});
