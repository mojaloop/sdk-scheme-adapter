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


class MockMojaloopRequests extends EventEmitter {
    constructor(config) {
        super();
        console.log('MockMojaloopRequests constructed');
        this.config = config;
    }

    getParties(...args) {
        console.log(`MockMojaloopRequests.getParties called with args: ${util.inspect(args)}`);
        setImmediate(() => { this.emit('getParties'); });
        return Promise.resolve(null);
    }

    postQuotes(...args) {
        console.log(`MockMojaloopRequests.postQuotes called with args: ${util.inspect(args)}`);
        setImmediate(() => { this.emit('postQuotes'); });
        return Promise.resolve(null);
    }

    postTransfers(...args) {
        console.log(`MockMojaloopRequests.postTransfers called with args: ${util.inspect(args)}`);
        setImmediate(() => { this.emit('postTransfers'); });
        return Promise.resolve(null);
    }
}


class MockIlp {
    constructor(config) {
        console.log('MockIlp constructed');
        this.config = config;
    }
}


module.exports = {
    MojaloopRequests: MockMojaloopRequests,
    Ilp: MockIlp
};
