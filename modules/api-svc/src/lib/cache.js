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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const redis = require('redis');
const EventEmitter = require('events');
const { TimeoutError } = require('./model/common/TimeoutError');

const CONN_ST = {
    CONNECTED: 'CONNECTED',
    CONNECTING: 'CONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    DISCONNECTING: 'DISCONNECTING',
};

/**
  * A shared cache abstraction over a REDIS distributed key/value store
  */
class Cache {
    constructor(config) {
        this._config = config;
        this._channelEmitter = new EventEmitter();

        if(!config.cacheUrl || !config.logger) {
            throw new Error('Cache config requires cacheUrl and logger properties');
        }

        this._logger = config.logger.push({ component: this.constructor.name });
        this._url = config.cacheUrl;

        // a redis connection to handle get, set and publish operations
        this._client = null;

        // connection/disconnection logic
        this._connectionState = CONN_ST.DISCONNECTED;

        // a redis connection to handle subscribe operations and published message routing
        // Note that REDIS docs suggest a client that is in SUBSCRIBE mode
        // should not have any other commands executed against it.
        // see: https://redis.io/topics/pubsub
        this._subscriptionClient = null;

        // a 'hashmap like' callback map
        this._callbacks = {};

        // tag each callback with an Id so we can gracefully unsubscribe and not leak resources
        this._callbackId = 0;

        this.subscribeTimeoutSeconds = config.subscribeTimeoutSeconds ?? 3;
        this._unsubscribeTimeoutMs = config.unsubscribeTimeoutMs;
        this._unsubscribeTimeoutMap = {};
    }

    /**
      * Connects to a redis server and waits for ready events
      * Note: We create two connections. One for get, set and publish commands
      * and another for subscribe commands. We do this as we are not supposed
      * to issue any non-pub/sub related commands on a connection used for sub
      * See: https://redis.io/topics/pubsub
      */
    async connect() {
        switch(this._connectionState) {
            case CONN_ST.CONNECTED:
                return;
            case CONN_ST.CONNECTING:
                await this._inProgressConnection;
                return;
            case CONN_ST.DISCONNECTED:
                break;
            case CONN_ST.DISCONNECTING:
                // TODO: should this be an error?
                // If we're disconnecting, we'll let that finish first
                await this._inProgressDisconnection;
                break;
        }
        this._connectionState = CONN_ST.CONNECTING;
        this._inProgressConnection = Promise.all([this._getClient(), this._getClient()]);
        [this._client, this._subscriptionClient] = await this._inProgressConnection;

        if (this._config.enableTestFeatures) {
            this.setTestMode(true);
        }

        this._inProgressConnection = null;
        this._connectionState = CONN_ST.CONNECTED;
    }

    /**
      * Configure Redis to emit keyevent events. This corresponds to the application test mode, and
      * enables us to listen for changes on callback_* and request_* keys.
      * Docs: https://redis.io/topics/notifications
      */
    async setTestMode(enable) {
        // See for modes: https://redis.io/topics/notifications#configuration
        // This mode, 'Es$' is:
        //   E     Keyevent events, published with __keyevent@<db>__ prefix.
        //   s     Set commands
        //   $     String commands
        const mode = enable ? 'Es$' : '';
        this._logger.isDebugEnabled && this._logger
            .push({ 'notify-keyspace-events': mode })
            .debug('Configuring Redis to emit keyevent events');
        await this._client.configSet('notify-keyspace-events', mode);
    }

    async disconnect() {
        switch(this._connectionState) {
            case CONN_ST.CONNECTED:
                break;
            case CONN_ST.CONNECTING:
                // TODO: should this be an error?
                // If we're connecting, we'll let that finish first
                await this._inProgressConnection;
                break;
            case CONN_ST.DISCONNECTED:
                return;
            case CONN_ST.DISCONNECTING:
                await this._inProgressDisconnection;
                return;
        }
        this._connectionState = CONN_ST.DISCONNECTING;
        this._inProgressDisconnection = Promise.all([
            this._client.quit(),
            this._subscriptionClient.quit()
        ]);
        this._client = null;
        this._subscriptionClient = null;
        await this._inProgressDisconnection;
        this._inProgressDisconnection = null;
        this._connectionState = CONN_ST.DISCONNECTED;
    }


    /**
      * Subscribes to a channel
      *
      * @param channel {string} - The channel name to subscribe to
      * @param callback {function} - Callback function to be executed when messages arrive on the specified channel
      * @returns {Promise} - Promise that resolves with an integer callback Id to submit in unsubscribe request
      */
    async subscribe(channel, callback) {
        // get an id for this callback
        const id = this._callbackId++;

        if(!this._callbacks[channel]) {
        // if this is the first subscriber for this channel we init the hashmap
            this._callbacks[channel] = { [id]: callback };
            await this._subscriptionClient.subscribe(channel, (msg) => {
                // we have some callbacks to make
                if (this._callbacks[channel]) {
                    for (const [id, cb] of Object.entries(this._callbacks[channel])) {
                        this._logger.isDebugEnabled && this._logger.debug(`Cache message received on channel ${channel}. Making callback with id ${id}`);

                        // call the callback with the channel name, message and callbackId...
                        // ...(which is useful for unsubscribe)
                        try {
                            cb(channel, msg, id);
                        } catch (err) {
                            this._logger.isErrorEnabled && this._logger
                                .push({ callbackId: id, err })
                                .error('Unhandled error in cache subscription handler');
                        }
                    }
                } else {
                    this._logger.isDebugEnabled && this._logger.debug(`Cache message received on unknown channel ${channel}. Ignoring...`);
                }
            });
        } else {
            this._callbacks[channel][id] = callback;
        }

        // store the callback against the channel/id
        this._logger.isDebugEnabled && this._logger.debug(`Subscribed to cache pub/sub channel ${channel}`);

        return id;
    }

    /**
     * Subscribes to a channel for some period and always returns resolved promise
     *
     * @param {string} channel - The channel name to subscribe to
     * @param {boolean} [needParse=true] - specify if the message should be parsed before returning
     *
     * @returns {Promise} - Promise that resolves with a message or an error
     */
    async subscribeToOneMessageWithTimerNew(channel, requestProcessingTimeoutSeconds, needParse = true) {
        let subscription;

        return new Promise((resolve, reject) => {

            const timer = setTimeout(async () => {
                if (subscription) {
                    this._channelEmitter.removeListener(channel, subscription);
                }
                // If there are no listeners left for this channel, we can unsubscribe
                if (this._channelEmitter.listenerCount(channel) === 0) {
                    if (this._subscriptionClient) {
                        await this._subscriptionClient.unsubscribe(channel);
                    }
                }
                const errMessage = 'Timeout error';
                this._logger.push({ channel }).warn(errMessage);
                reject(new TimeoutError(errMessage));
            }, requestProcessingTimeoutSeconds * 1000);

            subscription = (message) => {
                this._logger.push({ channel, message, needParse }).debug('subscribeToOneMessageWithTimer is done');
                clearTimeout(timer);
                resolve(needParse ? JSON.parse(message) : message);
            };
            this._channelEmitter.once(channel, subscription);

            this._subscriptionClient.subscribe(channel, async (msg) => {
                this._channelEmitter.emit(channel, msg);
                // If there are no listeners left for this channel, we can unsubscribe
                if (this._channelEmitter.listenerCount(channel) === 0) {
                    if (this._subscriptionClient) {
                        await this._subscriptionClient.unsubscribe(channel);
                    }
                }
            })
                .catch(err => {
                    this._logger.push({ channel, err }).warn(`error in subscribeToOneMessageWithTimer: ${err.message}`);
                    reject(err);
                });
        });
    }

    /**
     * Subscribes to a channel for some period and always returns resolved promise
     *
     * @param {string} channel - The channel name to subscribe to
     * @param {boolean} [needParse=true] - specify if the message should be parsed before returning
     *
     * @returns {Promise} - Promise that resolves with a message or an error
     */
    async subscribeToOneMessageWithTimer(channel, needParse = true) {
        let subId;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.unsubscribeSafely(channel, subId);
                const errMessage = 'Timeout error in subscribeToOneMessageWithTimer';
                this._logger.push({ channel, subId }).warn(errMessage);
                resolve(new Error(errMessage));
            }, this.subscribeTimeoutSeconds * 1000);

            this.subscribe(channel, (_, message) => {
                try {
                    this._logger.push({ channel, message, needParse }).debug('subscribeToOneMessageWithTimer is done');
                    resolve(needParse ? JSON.parse(message) : message);
                } catch (err) {
                    this._logger.push({ channel, err }).warn(`error in subscribeToOneMessageWithTimer: ${err.message}`);
                    resolve(err);
                } finally {
                    clearTimeout(timer);
                    this.unsubscribeSafely(channel, subId);
                }
            })
                .then(id => { subId = id; })
                .catch(err => {
                    this._logger.push({ channel, err }).warn(`subscribe error in subscribeToOneMessageWithTimer: ${err.message}`);
                    resolve(err);
                });
        });
    }


    /**
      * Unsubscribes a callback from a channel
      *
      * @param channel {string} - name of the channel to unsubscribe from
      * @param callbackId {integer} - id of the callback to remove
      */

    async unsubscribe(channel, callbackId, useUnsubscribeTimeout=false) {
        if(this._callbacks[channel] && this._callbacks[channel][callbackId]) {
            delete this._callbacks[channel][callbackId];
            this._logger.isDebugEnabled && this._logger.debug(`Cache unsubscribed callbackId ${callbackId} from channel ${channel}`);
            // The unsubscribeTimeout is used to mitigate a believed issue happening in the
            // parties lookup leg of transfers. When the same party is looked up multiple times in quick
            // succession, the cache is subscribed to the same channel multiple times. We believe that
            // requests that have just subscribed to the channel which have not received the message yet
            // are getting unsubscribed when requests that have completed call `unsubscribe`.
            // This leads the request state machine to timeout the request, fail and
            // stall the service. This issue is only affects parties lookup since it is the only
            // pub/sub that can use the same channel name, primarily in our `ml-core-test-harness` environment.
            if (Object.keys(this._callbacks[channel]).length < 1 && !useUnsubscribeTimeout){
                // no more callbacks for this channel
                delete this._callbacks[channel];
                if (this._subscriptionClient) {
                    await this._subscriptionClient.unsubscribe(channel);
                }
            }else if(Object.keys(this._callbacks[channel]).length < 1) {
                if (!this._unsubscribeTimeoutMap[channel]){
                    this._unsubscribeTimeoutMap[channel] = setTimeout(async () => {
                        // no more callbacks for this channel
                        delete this._callbacks[channel];
                        delete this._unsubscribeTimeoutMap[channel];
                        if (this._subscriptionClient) {
                            await this._subscriptionClient.unsubscribe(channel);
                        }
                    }, this._unsubscribeTimeoutMs);
                }
            } else {
                if (this._unsubscribeTimeoutMap[channel]) {
                    this._unsubscribeTimeoutMap[channel].refresh();
                }
            }
        } else {
            // we should not be asked to unsubscribe from a subscription we do not have. Raise this as a promise
            // rejection so it can be spotted. It may indicate a logic bug somewhere else
            this._logger.isErrorEnabled && this._logger.error(`Cache not subscribed to channel ${channel} for callbackId ${callbackId}`);
            throw new Error(`Channel ${channel} does not have a callback with id ${callbackId} subscribed`);
        }
    }

    async unsubscribeSafely(channelKey, subId) {
        if (channelKey && typeof subId === 'number') {
            return this.unsubscribe(channelKey, subId)
                .catch(err => {
                    this._logger.push({ err }).warn(`Unsubscribing cache error [${channelKey} ${subId}]: ${err.stack}`);
                });
        }
    }

    getSubscribers(channel) {
        return this._callbacks[channel];
    }

    /**
      * Returns a new redis client
      *
      * @returns {object} - a connected REDIS client
      * */
    async _getClient() {
        const client = redis.createClient({ url: this._url });

        client.on('error', (err) => {
            this._logger.isErrorEnabled && this._logger.push({ err }).error('Error from REDIS client getting subscriber');
        });

        client.on('reconnecting', (err) => {
            this._logger.isDebugEnabled &&  this._logger.push({ err }).debug('REDIS client Reconnecting');
        });

        client.on('subscribe', (channel, count) => {
            this._logger.isDebugEnabled && this._logger.push({ channel, count }).debug('REDIS client subscribe');
            // On a subscribe event, ensure that testFeatures are enabled.
            // This is required here in the advent of a disconnect/reconnect event. Redis client will re-subscribe all subscriptions, but previously enabledTestFeatures will be lost.
            // Handling this on the on subscribe event will ensure its always configured.
            if (this._config.enableTestFeatures) {
                this.setTestMode(true);
            }
        });

        client.on('connect', () => {
            this._logger.isDebugEnabled && this._logger.debug(`REDIS client connected at: ${this._url}`);
        });

        client.on('ready', () => {
            this._logger.isDebugEnabled && this._logger.debug(`Connected to REDIS at: ${this._url}`);
        });
        await client.connect();

        return client;
    }


    /**
      * Publishes the specified message to the specified channel
      *
      * @param channelName {string} - channel name to publish to
      * @param value - any type that will be converted to a JSON string (unless it is already a string) and published as the message
      * @returns {Promise} - Promise that will resolve with redis replies or reject with an error
      */
    async publish(channelName, value) {
        if(typeof(value) !== 'string') {
            // ALWAYS publish string values
            value = JSON.stringify(value);
        }
        await this._client.publish(channelName, value);
    }


    /**
      * Sets a value in the cache
      *
      * @param key {string} - cache key
      * @param value {string} - cache value
      * @param ttl {number} - cache ttl in seconds
      */
    async set(key, value, ttl=0 ) {
        //if we are given an object, turn it into a string
        if(typeof(value) !== 'string') {
            value = JSON.stringify(value);
        }
        // If ttl is positive i.e >0 then set expiry time as ttl in seconds
        if(ttl > 0)
            await this._client.set(key, value, { 'EX': ttl });
        else
            await this._client.set(key, value);

    }

    /**
      * Add the specified value to the set stored at key
      *
      * @param key {string} - cache key
      * @param value {string} - cache value
      */
    async add(key, value) {
        //if we are given an object, turn it into a string
        if(typeof(value) !== 'string') {
            value = JSON.stringify(value);
        }
        await this._client.sAdd(key, value);
    }

    /**
      * Returns all the members of the set value stored at key
      *
      * @param key {string} - cache key
      */
    async members(key) {
        return this._client.sMembers(key);
    }

    /**
      * Gets a value from the cache
      *
      * @param key {string} - cache key
      */
    async get(key) {
        let value = await this._client.get(key);
        if(typeof(value) === 'string') {
            try {
                value = JSON.parse(value);
            }
            catch(err) {
                this._logger.isErrorEnabled && this._logger.push({ err }).error('Error parsing JSON cache value');
            }
        }
        return value;
    }
}

// Define constants on the prototype, but prevent a user of the cache from overwriting them for all
// instances
Object.defineProperty(Cache.prototype, 'CALLBACK_PREFIX', { value: 'callback_', writable: false });
Object.defineProperty(Cache.prototype, 'REQUEST_PREFIX', { value: 'request_', writable: false });
Object.defineProperty(Cache.prototype, 'EVENT_SET', { value: '__keyevent@0__:set', writable: false });

module.exports = Cache;
