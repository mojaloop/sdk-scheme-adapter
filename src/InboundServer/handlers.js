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
const Model = require('@internal/model').InboundTransfersModel;
const { Errors } = require('@mojaloop/sdk-standard-components');

/**
 * Handles a GET /participants/{idType}/{idValue} request
 */
const getParticipantsByTypeAndId = async (ctx) => {
    // kick off an asynchronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                ...ctx.state.conf,
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                wso2Auth: ctx.state.wso2Auth,
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.getParticipants(ctx.state.path.params.Type,
                ctx.state.path.params.ID, ctx.state.path.params.SubId, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled GET /participants/{idType}/{idValue}');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.push({ err }).log('Error handling GET /participants/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
};


/**
 * Handles a GET /parties/{idType}/{idValue} request
 */
const getPartiesByTypeAndId = async (ctx) => {
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            if(ctx.state.conf.enableTestFeatures) {
                // we are in test mode so cache the request
                const req = {
                    headers: ctx.request.headers
                };
                const res = await ctx.state.cache.set(`request_${ctx.state.path.params.ID}`, req);
                ctx.state.logger.log(`Cacheing request : ${util.inspect(res)}`);
            }

            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                ...ctx.state.conf,
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                wso2Auth: ctx.state.wso2Auth,
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.getParties(ctx.state.path.params.Type, ctx.state.path.params.ID,
                ctx.state.path.params.SubId, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled GET /parties/{idType}/{idValue} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.push({ err }).log('Error handling GET /parties/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
};


/**
 * Handles a POST /parties/{idType}/{idValue} request
 */
const postPartiesByTypeAndId = (ctx) => {
    // creation of parties not supported by SDK
    ctx.response.status = 501;
    ctx.response.body = '';
};


/**
 * Handles a POST /quotes request
 */
const postQuotes = async (ctx) => {
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            if(ctx.state.conf.enableTestFeatures) {
                // we are in test mode so cache the request
                const req = {
                    headers: ctx.request.headers,
                    data: ctx.request.body
                };
                const res = await ctx.state.cache.set(`request_${ctx.request.body.quoteId}`, req);
                ctx.state.logger.log(`Cacheing request: ${util.inspect(res)}`);
            }

            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                ...ctx.state.conf,
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                wso2Auth: ctx.state.wso2Auth,
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.quoteRequest(ctx.request.body, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled POST /quotes request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.push({ err }).log('Error handling POST /quotes');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
};


/**
 * Handles a POST /transfers request
 */
const postTransfers = async (ctx) => {
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            if(ctx.state.conf.enableTestFeatures) {
                // we are in test mode so cache the request
                const req = {
                    headers: ctx.request.headers,
                    data: ctx.request.body
                };
                const res = await ctx.state.cache.set(`request_${ctx.request.body.transferId}`, req);
                ctx.state.logger.log(`Cacheing request: ${util.inspect(res)}`);
            }

            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                ...ctx.state.conf,
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                wso2Auth: ctx.state.wso2Auth,
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.prepareTransfer(ctx.request.body, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled POST /transfers request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.push({ err }).log('Error handling POST /transfers');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
};

/**
 * Handles a PUT /participants/{ID}. This is a response to a POST /participants request
 */
const putParticipantsById = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Caching callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`ac_${ctx.state.path.params.ID}`, {
        type: 'accountsCreationSuccessfulResponse',
        data: ctx.request.body
    });

    ctx.response.status = 200;
};


/**
 * Handles a PUT /participants/{ID}/error. This is an error response to a POST /participants request
 */
const putParticipantsByIdError = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Caching callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`ac_${ctx.state.path.params.ID}`, {
        type: 'accountsCreationErrorResponse',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a PUT /participants/{idType}/{idValue} request
 */
const putParticipantsByTypeAndId = async (ctx) => {
    // SDK does not make participants requests so we should not expect any calls to this method
    ctx.response.status = 501;
    ctx.response.body = '';
};


/**
 * Handles a PUT /parties/{idType}/{IdValue}. This is a response to a GET /parties
 * request.
 */
const putPartiesByTypeAndId = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing request: ${util.inspect(res)}`);
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const idSubValue = ctx.state.path.params.SubId;

    // publish an event onto the cache for subscribers to action
    const cacheId = `${idType}_${idValue}` + (idSubValue ? `_${idSubValue}` : '');
    await ctx.state.cache.publish(cacheId, ctx.request.body);
    ctx.response.status = 200;
};


/**
 * Handles a PUT /quotes/{ID}. This is a response to a POST /quotes request
 */
const putQuoteById = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`qt_${ctx.state.path.params.ID}`, {
        type: 'quoteResponse',
        data: ctx.request.body,
        headers: ctx.request.headers
    });

    ctx.response.status = 200;
};


/**
 * Handles a PUT /transfers/{ID}. This is a response to a POST /transfers request
 */
const putTransfersById = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`tf_${ctx.state.path.params.ID}`, {
        type: 'transferFulfil',
        data: ctx.request.body
    });

    ctx.response.status = 200;
};


/**
 * Handles a PUT /parties/{Type}/{ID}/error request. This is an error response to a GET /parties/{Type}/{ID} request
 */
const putPartiesByTypeAndIdError = async(ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing request: ${util.inspect(res)}`);
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const idSubValue = ctx.state.path.params.SubId;

    // publish an event onto the cache for subscribers to action
    // note that we publish the event the same way we publish a success PUT
    // the subscriber will notice the body contains an errorInformation property
    // and recognise it as an error response
    const cacheId = `${idType}_${idValue}` + (idSubValue ? `_${idSubValue}` : '');
    await ctx.state.cache.publish(cacheId, ctx.request.body);

    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a PUT /quotes/{ID}/error request. This is an error response to a POST /quotes request
 */
const putQuotesByIdError = async(ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`qt_${ctx.state.path.params.ID}`, {
        type: 'quoteResponseError',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a PUT /transfers/{ID}/error. This is an error response to a POST /transfers request
 */
const putTransfersByIdError = async (ctx) => {
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Cacheing callback: ${util.inspect(res)}`);
    }

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`tf_${ctx.state.path.params.ID}`, {
        type: 'transferError',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
};


const healthCheck = async(ctx) => {
    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a GET /requests/{ID} request. This is a test support method that allows the caller
 * to see the body of a previous incoming request.
 */
const getRequestById = async(ctx) => {
    if(!ctx.state.conf.enableTestFeatures) {
        // hide this endpoint if test features are disabled
        throw new Errors.MojaloopFSPIOPError(null, 'Couldn\'t match path requests', null,
            Errors.MojaloopApiErrorCodes.UNKNOWN_URI);
    }

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
    if(!ctx.state.conf.enableTestFeatures) {
        // hide this endpoint if test features are disabled
        throw new Errors.MojaloopFSPIOPError(null, 'Couldn\'t match path /callbacks', null,
            Errors.MojaloopApiErrorCodes.UNKNOWN_URI);
    }

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
    '/participants/{ID}': {
        put: putParticipantsById
    },
    '/participants/{Type}/{ID}': {
        put: putParticipantsByTypeAndId,
        get: getParticipantsByTypeAndId
    },
    '/participants/{Type}/{SubId}/{ID}': {
        put: putParticipantsByTypeAndId,
        get: getParticipantsByTypeAndId
    },
    '/participants/{ID}/error': {
        put: putParticipantsByIdError
    },
    '/parties/{Type}/{ID}': {
        post: postPartiesByTypeAndId,
        get: getPartiesByTypeAndId,
        put: putPartiesByTypeAndId
    },
    '/parties/{Type}/{ID}/{SubId}': {
        post: postPartiesByTypeAndId,
        get: getPartiesByTypeAndId,
        put: putPartiesByTypeAndId
    },
    '/parties/{Type}/{ID}/error': {
        put: putPartiesByTypeAndIdError
    },
    '/parties/{Type}/{ID}/{SubId}/error': {
        put: putPartiesByTypeAndIdError
    },
    '/quotes': {
        post: postQuotes
    },
    '/quotes/{ID}': {
        put: putQuoteById
    },
    '/quotes/{ID}/error': {
        put: putQuotesByIdError
    },
    '/transfers': {
        post: postTransfers
    },
    '/transfers/{ID}': {
        put: putTransfersById
    },
    '/transfers/{ID}/error': {
        put: putTransfersByIdError
    },
    '/requests/{ID}': {
        get: getRequestById
    },
    '/callbacks/{ID}': {
        get: getCallbackById
    }
};
