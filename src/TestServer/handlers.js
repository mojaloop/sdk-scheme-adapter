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

const { Errors } = require('@mojaloop/sdk-standard-components');

const healthCheck = async(ctx) => {
    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a GET /requests/{ID} request. This is a test support method that allows the caller
 * to see the body of a previous incoming request.
 */
const getRequestById = async(ctx) => {
    try {
        const req = await ctx.state.cache.get(`request_${ctx.state.path.params.ID}`);
        ctx.response.status = 200;
        ctx.response.body = req;
    }
    catch(err) {
        ctx.status = 500;
        ctx.response.body = err;
    }
};


/**
 * Handles a GET /callbacks/{ID} request. This is a test support method that allows the caller
 * to see the body of a previous incoming callback.
 */
const getCallbackById = async(ctx) => {
    try {
        const req = await ctx.state.cache.get(`callback_${ctx.state.path.params.ID}`);
        ctx.response.status = 200;
        ctx.response.body = req;
    }
    catch(err) {
        ctx.status = 500;
        ctx.response.body = err;
    }
};


module.exports = {
    '/': {
        get: healthCheck
    },
    '/requests/{ID}': {
        get: getRequestById
    },
    '/callbacks/{ID}': {
        get: getCallbackById
    },
};
