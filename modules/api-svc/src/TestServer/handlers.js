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

const { Enum } = require('@mojaloop/central-services-shared');
const { ReturnCodes } = Enum.Http;

const healthCheck = async(ctx) => {
    ctx.response.status = ReturnCodes.NOCONTENT.CODE;
    ctx.response.body = '';
};


/**
 * Handles a GET /requests/{ID} request. This is a test support method that allows the caller
 * to see the body of a previous incoming request.
 */
const getRequestById = async(ctx) => {
    try {
        const req = await ctx.state.cache.get(`request_${ctx.state.path.params.ID}`);
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = req;
    }
    catch(err) {
        ctx.status = ReturnCodes.INTERNALSERVERERRROR.CODE;
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
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = req;
    }
    catch(err) {
        ctx.status = ReturnCodes.INTERNALSERVERERRROR.CODE;
        ctx.response.body = err;
    }
};

/**
 * Handles a GET /fxQuoteRequests/{ID} request. This is a test support method that allows the caller
 * to see the body of a previous incoming callback.
 */
const getFxQuoteById = async(ctx) => {
    try {
        const req = await ctx.state.cache.get(`fxQuote_in_${ctx.state.path.params.ID}`);
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = req;
    }
    catch(err) {
        ctx.status = ReturnCodes.INTERNALSERVERERRROR.CODE;
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
    '/fxQuoteRequests/{ID}': {
        get: getFxQuoteById
    },
};
