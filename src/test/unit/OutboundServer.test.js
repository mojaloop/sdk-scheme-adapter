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

const util = require('util');
const Readable = require('stream').Readable;
const defaultConfig = require('./data/defaultConfig');

const postTransfersBody = require('./data/postTransfersBadBody');


// we use a mock koa (from our __mocks__ directory)
jest.mock('koa');
jest.mock('@internal/cache');
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('@internal/requests');

const Koa = require('koa');

const OutboundServer = require('../../OutboundServer');

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

    is(...args) {
        console.log(`DummyRequest.is called with args: ${util.inspect(args)}`);

        // simulate json
        if(Array.isArray(args[0]) && args[0][0] === 'application/json') {
            return true;
        }
        return false;
    }
}


const generatePostTransferRequest = (body) => {
    return {
        path: '/transfers',
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'accept': ''
        },
        body: body
    }; 
};


describe('Onbound Server', () => {
    let defConfig;

    beforeEach(() => {
        defConfig = JSON.parse(JSON.stringify(defaultConfig));
    });

    test('Fails validation on invalid request and gives detailed error message indicating source of failure', async () => {
        const server = new OutboundServer(defConfig);
        await server.setupApi();
        await server.start();

        const request = new DummyRequest(generatePostTransferRequest(postTransfersBody));

        // execute the request
        await Koa.__instance.request(request);

        // stop the server
        await server.stop();
        
        console.log(`#### ${util.inspect(request)}`);

        expect(request.response).toEqual({
            status: 400,
            body: {
                message: '.body.to.idType should be equal to one of the allowed values',
                statusCode: 400
            }
        });
    });
});
