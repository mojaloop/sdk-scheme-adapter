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

const redis = require('redis');

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

        if(!config.cacheUrl || !config.logger) {
            throw new Error('Cache config requires cacheUrl and logger properties');
        }

        this._logger = config.logger;
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
        this._logger
            .push({ 'notify-keyspace-events': mode })
            .log('Configuring Redis to emit keyevent events');
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
                for (const [id, cb] of Object.entries(this._callbacks[channel])) {
                    this._logger.log(`Cache message received on channel ${channel}. Making callback with id ${id}`);

                    // call the callback with the channel name, message and callbackId...
                    // ...(which is useful for unsubscribe)
                    try {
                        cb(channel, msg, id);
                    } catch (err) {
                        this._logger
                            .push({ callbackId: id, err })
                            .log('Unhandled error in cache subscription handler');
                    }
                }
            });
        } else {
            this._callbacks[channel][id] = callback;
        }

        // store the callback against the channel/id
        this._logger.log(`Subscribed to cache pub/sub channel ${channel}`);

        return id;
    }


    /**
      * Unsubscribes a callback from a channel
      *
      * @param channel {string} - name of the channel to unsubscribe from
      * @param callbackId {integer} - id of the callback to remove
      */
    async unsubscribe(channel, callbackId) {
        if(this._callbacks[channel] && this._callbacks[channel][callbackId]) {
            delete this._callbacks[channel][callbackId];
            this._logger.log(`Cache unsubscribed callbackId ${callbackId} from channel ${channel}`);

            if(Object.keys(this._callbacks[channel]).length < 1) {
                //no more callbacks for this channel
                delete this._callbacks[channel];
                await this._subscriptionClient.unsubscribe(channel);
            }
        } else {
            // we should not be asked to unsubscribe from a subscription we do not have. Raise this as a promise
            // rejection so it can be spotted. It may indiate a logic bug somewhere else
            this._logger.log(`Cache not subscribed to channel ${channel} for callbackId ${callbackId}`);
            throw new Error(`Channel ${channel} does not have a callback with id ${callbackId} subscribed`);
        }
    }

    /**
      * Returns a new redis client
      *
      * @returns {object} - a connected REDIS client
      * */
    async _getClient() {
        const client = redis.createClient({ url: this._url });

        client.on('error', (err) => {
            this._logger.push({ err }).log('Error from REDIS client getting subscriber');
        });

        client.on('reconnecting', (err) => {
            this._logger.push({ err }).log('REDIS client Reconnecting');
        });

        client.on('subscribe', (channel, count) => {
            this._logger.push({ channel, count }).log('REDIS client subscribe');
            // On a subscribe event, ensure that testFeatures are enabled.
            // This is required here in the advent of a disconnect/reconnect event. Redis client will re-subscribe all subscriptions, but previously enabledTestFeatures will be lost.
            // Handling this on the on subscribe event will ensure its always configured.
            if (this._config.enableTestFeatures) {
                // this.setTestMode(true);
            }
        });

        client.on('connect', () => {
            this._logger.log(`REDIS client connected at: ${this._url}`);
        });

        client.on('ready', () => {
            this._logger.log(`Connected to REDIS at: ${this._url}`);
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
      * @param value {stirng} - cache value
      */
    async set(key, value) {
        //if we are given an object, turn it into a string
        if(typeof(value) !== 'string') {
            value = JSON.stringify(value);
        }
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
                this._logger.push({ err }).log('Error parsing JSON cache value');
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
