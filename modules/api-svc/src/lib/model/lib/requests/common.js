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


const respErrSym = Symbol('ResponseErrorDataSym');
const safeStringify = require('fast-safe-stringify');


/**
 * An HTTPResponseError class
 */
class HTTPResponseError extends Error {
    constructor(params) {
        super(params.msg);
        this[respErrSym] = params;
    }

    getData() {
        return this[respErrSym];
    }

    toString() {
        return safeStringify(this[respErrSym]);
    }

    toJSON() {
        return JSON.stringify(this[respErrSym]);
    }
}


// Strip all beginning and end forward-slashes from each of the arguments, then join all the
// stripped strings with a forward-slash between them. If the last string ended with a
// forward-slash, append that to the result.
const buildUrl = (...args) => {
    return args
        .filter(e => e !== undefined)
        .map(s => s.replace(/(^\/*|\/*$)/g, '')) /* This comment works around a problem with editor syntax highglighting */
        .join('/')
        + ((args[args.length - 1].slice(-1) === '/') ? '/' : '');
};


const throwOrJson = async (res) => {
    // TODO: will a 503 or 500 with content-length zero generate an error?
    // or a 404 for that matter?!

    if (res.headers['content-length'] === '0' || res.statusCode === 204) {
        // success but no content, return null
        return null;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
        // not a successful request
        throw new HTTPResponseError({ msg: `Request returned non-success status code ${res.statusCode}`,
            res
        });
    }

    return res.data;
};


module.exports = {
    HTTPResponseError,
    buildUrl,
    throwOrJson,
};
