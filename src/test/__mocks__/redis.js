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
const EventEmitter = require('events');


class MockRedisClient extends EventEmitter {
    constructor() {
        super();
        console.log('MockRedisClient constructed');

        this.data = {};
    }

    subscribe(key, callback) {
        console.log(`MockRedisClient got subscription for key: ${key}`);
        if(typeof(callback) === 'function') {
            return callback();
        }
    }

    unsubscribe(...args) {
        if (args.length > 1) {
            console.log(`MockRedisClient got unsubscribe for key: ${args[0]}`);
        }

        if(args.length > 0 && typeof args[args.length - 1] === 'function') {
            return args[args.length - 1]();
        }
    }

    emitMessage(type, ...args) {
        process.nextTick(() => {
            console.log(`MockRedisClient emitting event: ${type} ${util.inspect(args)}`);
            this.emit(type, ...args);
        });
    }

    set(key, value, callback) {
        console.log(`MockRedisClient set called with key: ${key}  value: ${value}`);
        this.data[key] = value;
        return callback(null, 'OK');
    }

    get(key, callback) {
        console.log(`MockRedisClient get called with key: ${key}`);
        return callback(null, this.data[key]);
    }

    /**
     * Override EventEmitter on function so we can intercept some special cases
     */
    on(type, callback) {
        super.on(type, callback);

        if(type === 'ready') {
            // we got a redis ready handler hooked up, trigger it next tick
            process.nextTick(this.emit('ready'));
        }
    }

    quit(...args) {
        console.log(`MockRedisClient quit called with args: ${util.inspect(args)}`);
        if(typeof(args[0]) === 'function') {
            args[0]();
        }
    }
}


const createClient = (...args) => {
    console.log(`Mock redis createClient called with args ${util.inspect(args)}`);
    return new MockRedisClient();
};


module.exports = {
    createClient: createClient
};
