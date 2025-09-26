/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Yevhen Kyriukha - <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

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

    /**
     * Note: This Redis mock implementation does not support options like TTL (time-to-live).
     */
    set(key, value) {
        return promisify(super.set.bind(this))(key, value);
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
