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
const redis = require('redis');


/**
 * A shared cache abstraction over a REDIS distributed key/value store
 */
class Cache {
    constructor(config) {
        this.config = config;

        if(!config.host || !config.port || !config.logger) {
            throw new Error('Cache config requires host, port and logger properties');
        }

        this.logger = this.config.logger;

        // a redis connection to handle get, set and publish operations
        this.client = null;

        // a redis connection to handle subscribe operations and published message routing
        // Note that REDIS docs suggest a client that is in SUBSCRIBE mode
        // should not have any other commands executed against it.
        // see: https://redis.io/topics/pubsub
        this.subscriptionClient = null;

        // a 'hashmap like' callback map
        this.callbacks = {};

        // tag each callback with an Id so we can gracefully unsubscribe and not leak resources
        this.callbackId = 0;
    }


    /**
     * Connects to a redis server and waits for ready events
     * Note: We create two connections. One for get, set and publish commands
     * and another for subscribe commands. We do this as we are not supposed
     * to issue any non-pub/sub related commands on a connection used for sub
     * See: https://redis.io/topics/pubsub
     */
    async connect() {
        this.client = await this._getClient();
        this.subscriptionClient = await this._getClient();

        // hook up our sub message handler
        this.subscriptionClient.on('message', this._onMessage.bind(this));
    }


    /**
     * Subscribes to a channel
     *
     * @param channel {string} - The channel name to subscribe to
     * @param callback {function} - Callback function to be executed when messages arrive on the specified channel
     * @returns {Promise} - Promise that resolves with an integer callback Id to submit in unsubscribe request
     */
    async subscribe(channel, callback) {
        return new Promise((resolve, reject) => {
            this.subscriptionClient.subscribe(channel, (err) => {
                if(err) {
                    this.logger.log(`Error subscribing to channel ${channel}: ${err.stack || util.inspect(err)}`);
                    return reject(err);
                }
                else {
                    this.logger.log(`Subscribed to cache pub/sub channel ${channel}`);
                }

                if(!this.callbacks[channel]) {
                    // if this is the first subscriber for this channel we init the hashmap
                    this.callbacks[channel] = {};
                }

                // get an id for this callback
                const id = this.callbackId++;

                // store the callback against the channel/id
                this.callbacks[channel][id] = callback;

                // return the id we gave the callback
                return resolve(id);
            });
        });
    }


    /**
     * Unsubscribes a callback from a channel
     *
     * @param channel {string} - name of the channel to unsubscribe from
     * @param callbackId {integer} - id of the callback to remove
     */
    async unsubscribe(channel, callbackId) {
        return new Promise((resolve, reject) => {
            if(this.callbacks[channel] && this.callbacks[channel][callbackId]) {
                delete this.callbacks[channel][callbackId];
                this.logger.log(`Cache unsubscribed callbackId ${callbackId} from channel ${channel}`);

                if(Object.keys(this.callbacks[channel]).length < 1) {
                    //no more callbacks for this channel
                    delete this.callbacks[channel];
                }

                return resolve();
            }

            // we should not be asked to unsubscribe from a subscription we do not have. Raise this as a promise
            // rejection so it can be spotted. It may indiate a logic bug somewhere else
            this.logger.log(`Cache not subscribed to channel ${channel} for callbackId ${callbackId}`);
            return reject(new Error(`Channel ${channel} does not have a callback with id ${callbackId} subscribed`));
        });
    }


    /**
     * Handler for published messages
     */
    async _onMessage(channel, msg) {
        if(this.callbacks[channel]) {
            // we have some callbacks to make
            Object.keys(this.callbacks[channel]).forEach(k => {
                this.logger.log(`Cache message received on channel ${channel}. Making callback with id ${k}`);

                // call the callback with the channel name, message and callbackId...
                // ...(which is useful for unsubscribe)
                this.callbacks[channel][k](channel, msg, k);
            });
        }
    }


    /**
     * Returns a new redis client
     *
     * @returns {object} - a connected REDIS client
     * */
    async _getClient() {
        return new Promise((resolve, reject) => {
            let client = redis.createClient(this.config);

            client.on('error', (err) => {
                this.logger.push({ err }).log('Error from REDIS client getting subscriber');
                return reject(err);
            });

            client.on('ready', () => {
                this.logger.log(`Connected to REDIS at: ${this.config.host}:${this.config.port}`);
                return resolve(client);
            });
        });
    }


    /**
     * Publishes the specified message to the specified channel
     *
     * @param channelName {string} - channel name to publish to
     * @param value - any type that will be converted to a string (JSON if object) and published as the message
     * @returns {Promise} - Promise that will resolve with redis replies or reject with an error
     */
    async publish(channelName, value) {
        return new Promise((resolve, reject) => {
            if(typeof(value) !== 'string') {
                // ALWAYS publish string values
                value = JSON.stringify(value);
            }

            // note that we publish on the non-SUBSCRIBE connection
            this.client.publish(channelName, value, (err, replies) => {
                if(err) {
                    this.logger.push({ channelName, err }).log(`Error publishing to channel ${channelName}`);
                    return reject(err);
                }

                this.logger.push({ channelName, value }).log(`Published to channel ${channelName}`);
                return resolve(replies);
            });
        });
    }


    /**
     * Sets a value in the cache
     *
     * @param key {string} - cache key
     * @param value {stirng} - cache value
     */
    async set(key, value) {
        return new Promise((resolve, reject) => {
            //if we are given an object, turn it into a string
            if(typeof(value) !== 'string') {
                value = JSON.stringify(value);
            }

            this.client.set(key, value, (err, replies) => {
                if(err) {
                    this.logger.push({ key, value, err }).log(`Error setting cache key: ${key}`);
                    return reject(err);
                }

                this.logger.push({ key, value, replies }).log(`Set cache key: ${key}`);
                return resolve(replies);
            });
        });
    }

    /**
     * Gets a value from the cache
     *
     * @param key {string} - cache key
     */
    async get(key) {
        return new Promise((resolve, reject) => {
            this.client.get(key, (err, value) => {
                if(err) {
                    this.logger.push({ key, err }).log(`Error getting cache key: ${key}`);
                    return reject(err);
                }

                this.logger.push({ key, value }).log(`Got cache key: ${key}`);

                if(typeof(value) === 'string') {
                    try {
                        value = JSON.parse(value);
                    }
                    catch(err) {
                        this.logger.push({ err }).log('Error parsing JSON cache value');
                        return reject(err);
                    }
                }

                return resolve(value);
            });
        });
    }
}


module.exports = Cache;
