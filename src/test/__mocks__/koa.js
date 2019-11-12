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

/**
 * A mock Koa HTTP server. This allows handler chains to be unit tested without the need for an HTTP server
 */
class MockKoa {
    constructor(...args) {
        console.log(`MockKoa constructor called with args: ${util.inspect(args)}`);
        this.handlers = [];
        MockKoa.__instance = this;
    }


    use (...args) {
        console.log(`MockKoa use called with args: ${util.inspect(args)}`);
        this.handlers.push(args[0]);
    }


    request(ctx) {
        const handlerChainFunc = this.compose(this.handlers);
        return handlerChainFunc(ctx, ctx => ctx);
    }

    // copy/paste from koa-compose (https://github.com/koajs/compose/blob/master/index.js)
    compose (middleware) {
        if (!Array.isArray(middleware)) {
            throw new TypeError('Middleware stack must be an array!');
        }

        for (const fn of middleware) {
            if (typeof fn !== 'function') {
                throw new TypeError('Middleware must be composed of functions!');
            }
        }

        /**
         * @param {Object} context
         * @return {Promise}
         */
        return function (context, next) {
            // last called middleware #
            let index = -1;
            return dispatch(0);

            function dispatch (i) {
                if (i <= index) {
                    return Promise.reject(new Error('next() called multiple times'));
                }

                index = i;
                let fn = middleware[i];

                if (i === middleware.length) {
                    fn = next;
                }

                if (!fn) {
                    return Promise.resolve();
                }

                try {
                    return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
                } catch (err) {
                    return Promise.reject(err);
                }
            }
        };
    }

    callback(...args) {
        console.log(`MockKoa callback called with args: ${util.inspect(args)}`);
    }


    listen(...args) {
        console.log(`MockKoa listen called with args: ${util.inspect(args)}`);
    }
}


module.exports = MockKoa;
