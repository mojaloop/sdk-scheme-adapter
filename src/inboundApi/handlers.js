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
const Model = require('@internal/model').inboundTransfersModel;
const BackendRequests = require('@internal/requests').BackendRequests;


/**
 * Handles a GET /participants/{idType}/{idValue} request 
 */
const getParticipantsByTypeAndId = async (ctx) => {
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.getParticipantsByTypeAndId(ctx.state.path.params.Type,
                ctx.state.path.params.ID, sourceFspId);

            // log the result
            ctx.state.logger.log(`Inbound transfers model handled GET /participants/{idType}/{idValue} request and returned: ${util.inspect(response)}`);
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.log(`Error handling GET /participants/{idType}/{idValue}: ${err.stack || util.inspect(err)}`);
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
            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.getParties(ctx.state.path.params.Type, ctx.state.path.params.ID, sourceFspId);

            // log the result
            ctx.state.logger.log(`Inbound transfers model handled GET /parties/{idType}/{idValue} request and returned: ${util.inspect(response)}`);
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.log(`Error handling GET /parties/{idType}/{idValue}: ${err.stack || util.inspect(err)}`);
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
            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            // use the model to handle the request
            if (ctx.fxpQuote) {
                console.log('\x1b[46m\x1b[31m%s\x1b[0m', 'FXP QUOTE handler');
                const response = await model.fxQuoteRequest(ctx.request.headers, ctx.request.body);
                console.log('\x1b[46m\x1b[31m%s\x1b[0m', `FXP QUOTE handler response: ${response === null ? 'no content' : JSON.stringify(response, null, 2)}`);
                ctx.state.logger.log(`Inbound transfers model handled FX POST /quotes request and returned: ${util.inspect(response)}`);

            } else {
                const sourceFspId = ctx.request.headers['fspiop-source'];
                const response = await model.quoteRequest(ctx.request.body, sourceFspId);
                ctx.state.logger.log(`Inbound transfers model handled POST /quotes request and returned: ${util.inspect(response)}`);
            }
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.log(`Error handling POST /quotes: ${err.stack || util.inspect(err)}`);
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
            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];
            const destinationFspId = ctx.request.headers['fspiop-destination'];

            // use the model to handle the request
            const response = await model.prepareTransfer(ctx.request.body, sourceFspId, destinationFspId);

            // log the result
            ctx.state.logger.log(`Inbound transfers model handled POST /transfers request and returned: ${util.inspect(response)}`);
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.log(`Error handling POST /transfers: ${err.stack || util.inspect(err)}`);
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
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
    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`${idType}_${idValue}`, ctx.request.body);

    ctx.response.status = 200;
};


/**
 * Handles a PUT /quotes/{ID}. This is a response to a POST /quotes request
 */
const putQuoteById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    console.log('\x1b[47m\x1b[30m%s\x1b[0m', ` PUT /quotes/{ID} received with headers: ${JSON.stringify(ctx.request.headers, null, 2)} and body: ${JSON.stringify(ctx.request.body, null, 2)}`);

    if (ctx.state.conf.forwardPutQuotesToBackend) {
        let backendRequests = new BackendRequests({
            logger: ctx.state.logger,
            backendEndpoint: ctx.state.conf.backendEndpoint,
            dfspId: ctx.state.conf.dfspId
        });
        
        let response = await backendRequests.postFxpQuote(ctx.state.path.params.ID, ctx.request.body.quoteResponse ? ctx.request.body.quoteResponse : ctx.request.body , 
            { ...ctx.request.headers, ...ctx.request.body.metadata });
        console.log('Sent PUT /quotes to backend and got back: ', response);

    } else {
        await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
            type: 'quoteResponse',
            data: ctx.request.body,
            headers: ctx.request.headers
        });
    }

    ctx.response.status = 200;

};


/**
 * Handles a PUT /transfers/{ID}. This is a response to a POST /transfers request 
 */
const putTransfersById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'transferFulfil',
        data: ctx.request.body,
        headers: ctx.request.headers
    });

    ctx.response.status = 200;
};


/**
 * Handles a PUT /parties/{Type}/{ID}/error request. This is an error response to a GET /parties/{Type}/{ID} request
 */
const putPartiesByTypeAndIdError = async(ctx) => {
    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;

    // publish an event onto the cache for subscribers to action
    // note that we publish the event the same way we publish a success PUT
    // the subscriber will notice the body contains an errorInformation property
    // and recognise it as an error response
    await ctx.state.cache.publish(`${idType}_${idValue}`, ctx.request.body);

    ctx.response.status = 200;
    ctx.response.body = '';
};


/**
 * Handles a PUT /quotes/{ID}/error request. This is an error response to a POST /quotes request 
 */
const putQuotesByIdError = async(ctx) => {
    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
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
    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
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


const map = {
    '/': {
        get: healthCheck
    },
    '/participants/{Type}/{ID}': {
        put: putParticipantsByTypeAndId,
        get: getParticipantsByTypeAndId
    },
    '/parties/{Type}/{ID}': {
        post: postPartiesByTypeAndId,
        get: getPartiesByTypeAndId,
        put: putPartiesByTypeAndId
    },
    '/parties/{Type}/{ID}/error': {
        put: putPartiesByTypeAndIdError,
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
    }
};


module.exports = {
    map
};
