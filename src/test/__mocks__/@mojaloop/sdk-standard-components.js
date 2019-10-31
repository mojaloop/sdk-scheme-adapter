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

const actual = require.requireActual('@mojaloop/sdk-standard-components');
const Errors = actual.Errors;

class MockMojaloopRequests extends EventEmitter {
    constructor(config) {
        super();
        console.log('MockMojaloopRequests constructed');
        this.config = config;
    }

    getParties(...args) {
        console.log(`MockMojaloopRequests.getParties called with args: ${util.inspect(args, { depth: 20 })}`);
        setImmediate(() => { this.emit('getParties'); });
        return Promise.resolve(null);
    }

    postQuotes(...args) {
        console.log(`MockMojaloopRequests.postQuotes called with args: ${util.inspect(args, { depth: 20 })}`);
        setImmediate(() => { this.emit('postQuotes'); });
        return Promise.resolve(null);
    }

    putQuotes(...args) {
        console.log(`MockMojaloopRequests.putQuotes called with args: ${util.inspect(args)}`);
        setImmediate(() => { this.emit('putQuotes'); });
        return Promise.resolve(null);
    }

    putQuotesError(...args) {
        console.log(`MockMojaloopRequests.putQuotesError called with args: ${util.inspect(args)}`);
        setImmediate(() => { this.emit('putQuotesError'); });
        return Promise.resolve(null);
    }


    postTransfers(...args) {
        console.log(`MockMojaloopRequests.postTransfers called with args: ${util.inspect(args, { depth: 20 })}`);
        setImmediate(() => { this.emit('postTransfers'); });
        return Promise.resolve(null);
    }
}


class MockIlp {
    constructor(config) {
        console.log('MockIlp constructed');
        this.config = config;
    }

    validateFulfil(fulfil, condition) {
        console.log(`Mock ILP not checking fulfil ${fulfil} against condition ${condition}`);
        return true;
    }

    getQuoteResponseIlp(...args) {
        console.log(`MockIlp.getQuoteResponseIlp called with args: ${util.inspect(args)}`);

        return {
            fulfilment: 'mockGeneratedFulfilment',
            ilpPacket: 'mockBase64encodedIlpPacket',
            condition: 'mockGeneratedCondition'
        };
    }
}


class MockJwsValidator {
    constructor(config) {
        this.validateCalled = 0;
        this.config = config;
        console.log(`MockJwsValidator constructed with config: ${util.inspect(config)}`);
    }

    validate(...args) {
        this.validateCalled++;
        console.log(`MockJwsValidator validate called with args: ${util.inspect(args)}`);
        return true;
    }

}

class MockJwsSigner {
    constructor(config) {
        this.config = config;
        console.log(`MockJwsSigner constructed with config: ${util.inspect(config)}`);
    }
}


module.exports = {
    MojaloopRequests: MockMojaloopRequests,
    Ilp: MockIlp,
    Jws: {
        validator: MockJwsValidator,
        signer: MockJwsSigner
    },
    Errors: Errors
};
