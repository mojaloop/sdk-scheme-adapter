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
const util = require('util');


/**
 * A shard cache abstraction over a REDIS distributed key/value store
 */
class Cache {
    constructor(config) {
        this.config = config;
       
        if(!config.host || !config.port || !config.logger) {
            throw new Error('Cache config requires host, port and logger properties');
        }

        this.logger = this.config.logger;
    }

    /**
     * Connects to a redis server and waits for the ready event
     */
    async connect() {
        this.client = await this.getClient();
    }


    /**
     * Returns a new redis client
     *
     * @returns {object} - a connected REDIS client 
     * */
    async getClient() {
        return new Promise((resolve, reject) => {
            let sub = redis.createClient(this.config);

            sub.on('error', (err) => {
                this.logger.log(`Error from REDIS client getting subscriber: ${err.stack || util.inspect(err)}`);
                return reject(err);
            });

            sub.on('ready', () => {
                this.logger.log(`Connected to REDIS at: ${this.config.host}:${this.config.port}`);
                return resolve(sub);
            });
        });
    }    


    async publish(channelName, value) {
        return new Promise((resolve, reject) => {
            if(typeof(value) !== 'string') {
                value = JSON.stringify(value);
            }

            this.client.publish(channelName, value, (err, replies) => {
                if(err) {
                    this.logger.log(`Error publishing to channel ${channelName}: ${err.stack || util.inspect(err)}`);
                    return reject(err);
                }

                this.logger.log(`Published ${value} to channel ${channelName}`);
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
                    this.logger.log(`Error setting cache key: ${key} and value: ${value}: ${err.stack || util.inspect(err)}`);
                    return reject(err);
                }

                this.logger.log(`Set cache key: ${key} with value: ${value}: ${util.inspect(replies)}`);
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
                    this.logger.log(`Error getting cache key: ${key}: ${err.stack || util.inspect(err)}`);
                    return reject(err);
                }

                this.logger.log(`Get cache key: ${key} got: ${util.inspect(value)}`);
                
                if(typeof(value) === 'string') {
                    try {
                        value = JSON.parse(value);
                    }
                    catch(err) {
                        this.logger.log(`Error parsing JSON cache value: ${err.stack || util.inspect(err)}`);
                        return reject(err);
                    }
                }                    

                return resolve(value);
            });
        });
    }
}


module.exports = Cache;
