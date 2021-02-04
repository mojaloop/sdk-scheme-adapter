/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';
const pr = require('promise-timeout');

class InitAndJobRequiredByWait extends Error {
    constructor(channel) {
        super(`'init' & 'job' methods of ObservedJob(cache, channel:'${channel}') should be called before 'wait' method`);
        this.channel = channel;
    }
}

class DeferredJob {

    constructor(cache, channel, defaultTimeoutInMs) {
        this.cache = cache;
        this.channel = channel;
        this.defaultTimeoutInMs = defaultTimeoutInMs || deferredJob.defaultTimeoutInMs;
        this.sid = this.tailInit = this.listenerJob = null;
    }

    init(tailInit) {
        this.tailInit = tailInit;
        return this;
    }

    job(job) {
        this.listenerJob = job;
        return this;
    }

    async wait(timeout) {
        // mvp validation
        if (!(this.tailInit || this.listenerJob)) {
            throw new InitAndJobRequiredByWait(this.channel);
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise(async (resolve, reject) => {
            try {
                // subscribe to the channel to execute the jobCb when the message arrive
                this.sid = await this.cache.subscribe(this.channel, async (channel, message) => {
                    // consume message
                    try {
                        // unsubscribe first to be sure the jobCb will be executed only once
                        // and system resources are preserved
                        this.unsubscribe();
                        
                        // messages comes as stringified JSON
                        // and we don't want to bother listener about de-serialization
                        const parsed = JSON.parse(message);

                        // invoke deferred job
                        this.listenerJob(parsed);
                    } catch (err) {
                        return reject(err);
                    }

                    // done
                    resolve();
                });

                // invoke the async task which should effects in the future
                // by publishing the message to channel via trigger method
                // so the jobCb will be invoked
                await this.tailInit(this.channel, this.sid);
            } catch (err) {
                this.unsubscribe();
                reject(err);
            }
        });
    
        // ensure the whole process will finish in specified timeout
        // throws error if timeout happens
        return pr.timeout(promise, timeout || this.defaultTimeoutInMs)
            .catch(async (err) => {
                await this.unsubscribe();
                throw err;
            });
    }

    async unsubscribe() {
        if (this.sid && this.cache && this.channel) {
            await this.cache.unsubscribe(this.channel, this.sid);
            this.sid = null;
        }
    }
    
    // trigger the deferred job
    async trigger(message) {
        // message must be stringified before passing via channel
        const stringified = JSON.stringify(message);
        return this.cache.publish(this.channel, stringified);
    }


}

function deferredJob(cache, channel, defaultTimeoutInMs) {
    return new DeferredJob(cache, channel, defaultTimeoutInMs);
}

deferredJob.defaultTimeoutInMs = 2000;

module.exports = deferredJob;
