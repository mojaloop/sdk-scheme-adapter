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
const Metrics = require('@mojaloop/central-services-metrics');

/**
 * Handles a GET /participants/{idType}/{idValue} request
 */
const getParticipantsByTypeAndId = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_get_participants_type_id',
        'Used to find out in which FSP the requested Party, defined by, and optionally, is located',
        ['success', 'fspId']
    ).startTimer();
    // kick off an asynchronous operation to handle the request
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
            ctx.state.logger.push({ response }).log('Inbound transfers model handled GET /participants/{idType}/{idValue}');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            histTimerEnd({ success: false });
            ctx.state.logger.push({ err }).log('Error handling GET /participants/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
    histTimerEnd({ success: true });
};


/**
 * Handles a GET /parties/{idType}/{idValue} request
 */
const getPartiesByTypeAndId = async (ctx) => {
    // kick off an asyncronous operation to handle the request
    const histTimerEnd = Metrics.getHistogram(
        'inbound_get_parties_type_id',
        'Used to lookup information regarding the requested Party',
        ['success', 'fspId']
    ).startTimer();
    (async () => {
        try {
            if(ctx.state.conf.enableTestFeatures) {
                // we are in test mode so cache the request
                const req = {
                    headers: ctx.request.headers
                };
                const res = await ctx.state.cache.set(`request_${ctx.state.path.params.ID}`, req);
                ctx.state.logger.log(`Caching request : ${util.inspect(res)}`);
            }

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
            ctx.state.logger.push({ response }).log('Inbound transfers model handled GET /parties/{idType}/{idValue} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            histTimerEnd({ success: false });
            ctx.state.logger.push({ err }).log('Error handling GET /parties/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
    histTimerEnd({ success: true });
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
    const histTimerEnd = Metrics.getHistogram(
        'inbound_post_quotes',
        'Used to request the creation of a quote for the provided financial transaction in the server.',
        ['success', 'fspId']
    ).startTimer();
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
                ctx.state.logger.log(`Caching request: ${util.inspect(res)}`);
            }

            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.quoteRequest(ctx.request.body, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled POST /quotes request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            histTimerEnd({ success: false });
            ctx.state.logger.push({ err }).log('Error handling POST /quotes');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
    histTimerEnd({ success: true });
};


/**
 * Handles a POST /transfers request
 */
const postTransfers = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_post_transfers',
        'Used to request the creation of a transfer for the next ledger, and a financial transaction for the Payee',
        ['success', 'fspId']
    ).startTimer();
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
                ctx.state.logger.log(`Caching request: ${util.inspect(res)}`);
            }

            // use the transfers model to execute asynchronous stages with the switch
            const model = new Model({
                cache: ctx.state.cache,
                logger: ctx.state.logger,
                ...ctx.state.conf
            });

            const sourceFspId = ctx.request.headers['fspiop-source'];

            // use the model to handle the request
            const response = await model.prepareTransfer(ctx.request.body, sourceFspId);

            // log the result
            ctx.state.logger.push({ response }).log('Inbound transfers model handled POST /transfers request');
            histTimerEnd({ success: true });
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            histTimerEnd({ success: false });
            ctx.state.logger.push({ err }).log('Error handling POST /transfers');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = 202;
    ctx.response.body = '';
    histTimerEnd({ success: true });
};

/**
 * Handles a PUT /participants/{ID}. This is a response to a POST /participants request
 */
const putParticipantsById = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_participants_id',
        'Used to inform the client of the result of the creation of the provided list of identities.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'accountsCreationSuccessfulResponse',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /participants/{ID}/error. This is an error response to a POST /participants request
 */
const putParticipantsByIdError = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_participants_type_id_error',
        'If the server is unable to find, create or delete the associated FSP of the provided identity, or another processing error occurred.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'accountsCreationErrorResponse',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
    histTimerEnd({ success: true });
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
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_parties_type_id',
        'Used to inform the client of a successful result of the Party information lookup.',
        ['success', 'fspId']
    ).startTimer();
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Caching request: ${util.inspect(res)}`);
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;

    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(`${idType}_${idValue}`, ctx.request.body);

    ctx.response.status = 200;
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /quotes/{ID}. This is a response to a POST /quotes request
 */
const putQuoteById = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_quotes_id',
        'Used to inform the client of a requested or created quote.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'quoteResponse',
        data: ctx.request.body,
        headers: ctx.request.headers
    });

    ctx.response.status = 200;
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /transfers/{ID}. This is a response to a POST /transfers request
 */
const putTransfersById = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_transfers_id',
        'Used to inform the client of a requested or created transfer.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'transferFulfil',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /parties/{Type}/{ID}/error request. This is an error response to a GET /parties/{Type}/{ID} request
 */
const putPartiesByTypeAndIdError = async(ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_parties_type_id_error',
        'If the server is unable to find Party information of the provided identity, or another processing error occurred.',
        ['success', 'fspId']
    ).startTimer();
    if(ctx.state.conf.enableTestFeatures) {
        // we are in test mode so cache the request
        const req = {
            headers: ctx.request.headers,
            data: ctx.request.body
        };
        const res = await ctx.state.cache.set(`callback_${ctx.state.path.params.ID}`, req);
        ctx.state.logger.log(`Caching request: ${util.inspect(res)}`);
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;

    // publish an event onto the cache for subscribers to action
    // note that we publish the event the same way we publish a success PUT
    // the subscriber will notice the body contains an errorInformation property
    // and recognise it as an error response
    await ctx.state.cache.publish(`${idType}_${idValue}`, ctx.request.body);

    ctx.response.status = 200;
    ctx.response.body = '';
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /quotes/{ID}/error request. This is an error response to a POST /quotes request
 */
const putQuotesByIdError = async(ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_quotes_id_error',
        'If the server is unable to find or create a quote, or some other processing error occurs.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'quoteResponseError',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
    histTimerEnd({ success: true });
};


/**
 * Handles a PUT /transfers/{ID}/error. This is an error response to a POST /transfers request
 */
const putTransfersByIdError = async (ctx) => {
    const histTimerEnd = Metrics.getHistogram(
        'inbound_put_transfers_id_error',
        'If the server is unable to find or create a transfer, or another processing error occurs.',
        ['success', 'fspId']
    ).startTimer();
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
    await ctx.state.cache.publish(`${ctx.state.path.params.ID}`, {
        type: 'transferError',
        data: ctx.request.body
    });

    ctx.response.status = 200;
    ctx.response.body = '';
    histTimerEnd({ success: true });
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

const metrics = async (ctx) => {
    ctx.response.status = 200;
    ctx.response.body = Metrics.getMetricsForPrometheus();
};

const map = {
    '/': {
        get: {
            handler: healthCheck,
            id: 'inbound_health_check'
        }
    },
    '/participants/{ID}': {
        put: {
            handler: putParticipantsById,
            id: 'inbound_put_participants_id'
        }
    },
    '/participants/{Type}/{ID}': {
        put: {
            handler: putParticipantsByTypeAndId,
            id: 'inbound_put_participants_type_id'
        },
        get: {
            handler: getParticipantsByTypeAndId,
            id: 'inbound_get_participants_type_id'
        }
    },
    '/participants/{ID}/error': {
        put: {
            handler: putParticipantsByIdError,
            id: 'inbound_put_participants_type_id_error'
        }
    },
    '/parties/{Type}/{ID}': {
        post: {
            handler: postPartiesByTypeAndId,
            id: 'inbound_post_parties_type_id'
        },
        get: {
            handler: getPartiesByTypeAndId,
            id: 'inbound_get_parties_type_id'
        },
        put: {
            handler: putPartiesByTypeAndId,
            id: 'inbound_put_parties_type_id'
        }
    },
    '/parties/{Type}/{ID}/error': {
        put: {
            handler: putPartiesByTypeAndIdError,
            id: 'inbound_put_parties_type_id_error'
        }
    },
    '/quotes': {
        post: {
            handler: postQuotes,
            id: 'inbound_post_quotes'
        }
    },
    '/quotes/{ID}': {
        put: {
            handler: putQuoteById,
            id: 'inbound_put_quotes_id'
        }
    },
    '/quotes/{ID}/error': {
        put: {
            handler: putQuotesByIdError,
            id: 'inbound_put_quotes_id_error'
        }
    },
    '/transfers': {
        post: {
            handler: postTransfers,
            id: 'inbound_post_transfers'
        }
    },
    '/transfers/{ID}': {
        put: {
            handler: putTransfersById,
            id: 'inbound_put_transfers_id'
        }
    },
    '/transfers/{ID}/error': {
        put: {
            handler: putTransfersByIdError,
            id: 'inbound_put_transfers_id_error'
        }
    },
    '/requests/{ID}': {
        get: {
            handler: getRequestById,
            id: 'inbound_get_requests_id'
        }
    },
    '/callbacks/{ID}': {
        get: {
            handler: getCallbackById,
            id: 'inbound_get_callbacks_id'
        }
    },
    '/metrics': {
        get: {
            handler: metrics,
            id: 'inbound_get_metrics'
        }
    }
};


module.exports = {
    map
};
