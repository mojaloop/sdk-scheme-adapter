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

const EventEmitter = require('events');

class MockClient extends EventEmitter {
    constructor() {
        super();
        console.log('MockClient constructed');
    }

    subscribe(key) {
        console.log(`MockClient got subscription for key: ${key}`);
    }

    unsubscribe(key, callback) {
        console.log(`MockClient got unsubscribe for key: ${key}`);

        if(callback) {
            return callback();
        }
    }

    emitMessage(data) {
        process.nextTick(() => {
            console.log(`MockClient emitting event data: ${data}`);
            this.emit('message', 'channel', data);
        });
    }
}


class MockCache {
    constructor() {
        console.log('MockCache constructed');

        this.data = {};
    }

    async set(key, value) {
        this.data[key] = value;
        return Promise.resolve('OK');
    }

    async get(key) {
        return Promise.resolve(this.data[key]);
    }

    emitMessage(data) {
        this.client.emitMessage(data);
    }

    async getClient() {
        if(!this.client) {
            this.client = new MockClient();
        }
        return Promise.resolve(this.client);
    }
}


module.exports = MockCache;
