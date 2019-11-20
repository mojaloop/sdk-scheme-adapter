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


/**
 * Mocks an http request object - suitable for simulating requests to koa middleware
 */
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


module.exports = DummyRequest;
