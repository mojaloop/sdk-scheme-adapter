/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

const redisMock = require('redis-mock');
const { promisify } = require('util');

const { EventEmitter } = require('events');

const events = {};

// redis-mock currently ignores callback arguments, the following class fixes that
class RedisClient extends redisMock.RedisClient {
    constructor(opts) {
        super(opts);
        this._redisMock.setMaxListeners(30);
        events[opts.cacheUrl] = events[opts.cacheUrl] || new EventEmitter();
        this.events = events[opts.cacheUrl];
    }

    async subscribe(...args) {
        this.events.on(...args);
        // return promisify(super.subscribe.bind(this))(...args);
    }

    async unsubscribe(channel) {
        this.events.removeAllListeners(channel);
    }

    async publish(...args) {
        process.nextTick(() => this.events.emit(...args));
    }

    set(...args) {
        return promisify(super.set.bind(this))(...args);
    }

    get(...args) {
        return promisify(super.get.bind(this))(...args);
    }

    keys(...args) {
        return promisify(super.keys.bind(this))(...args);
    }

    end() {
        this._redisMock.removeAllListeners('message');
        this.events.removeAllListeners();
    }

    connect() {}

    async disconnect() {
        return this.end();
    }

    async quit() {
        return this.end();
    }

    sAdd(...args) {
        return promisify(super.sadd.bind(this))(...args);
    }

    sMembers(...args) {
        return promisify(super.smembers.bind(this))(...args);
    }

    configSet() {}
}

module.exports = {
    createClient: (opts) => new RedisClient(opts),
};
