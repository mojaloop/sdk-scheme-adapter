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

const redisMock = require('redis-mock');

// redis-mock currently ignores callback argument, the following class fix this
class RedisClient extends redisMock.RedisClient {
    constructor(options, stream, redisMock) {
        super(options, stream, redisMock);
    }

    _executeCallback(...args) {
        if (typeof args[args.length - 1] === 'function') {
            const callback = args[args.length - 1];
            const argList = Array.prototype.slice.call(args, 0, args.length - 1);
            callback(null, argList);
        }
    }

    subscribe(...args) {
        super.subscribe(...args);
        this._executeCallback(...args);
    }

    publish(...args) {
        super.publish(...args);
        this._executeCallback(...args);
    }

    set(...args) {
        super.set(...args);
        this._executeCallback(...args);
    }
}



module.exports = {
    createClient: (options = {host: 'localhost', port: 6380}, stream, redisMock) => new RedisClient(options, stream, redisMock),
};
