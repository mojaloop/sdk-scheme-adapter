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
 - James Bush <james.bus@mojaloop.io>

 * Modusbox
 - Steven Oderayi <steven.oderayi@infitx.com>

 * Modusbox
 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/
'use strict';

const { Enum } = require('@mojaloop/central-services-shared');
const {
    InboundTransfersModel,
    InboundPingModel,
    PartiesModel,
    QuotesModel,
    TransfersModel,
} = require('../lib/model');
const { CacheKeyPrefixes } = require('../lib/model/common');
const { generateTraceparent } = require('../lib/utils');

const { ReturnCodes } = Enum.Http;

const extractBodyHeadersSourceFspId = ctx => ({
    sourceFspId: ctx.request.headers['fspiop-source'],
    body: { ...ctx.request.body },
    headers: { ...ctx.request.headers },
});

const extractTraceHeaders = ctx => {
    const { traceparent = generateTraceparent(), tracestate } = ctx.request.headers;

    const traceHeaders = {
        traceparent,
        ...(tracestate && { tracestate })
    };
    ctx.state?.logger?.isVerboseEnabled && ctx.state.logger.push({ traceHeaders }).verbose('extracted traceHeaders');

    return traceHeaders;
};

/**
 * @param {Object} ctx - the Koa context object
 * @returns {InboundTransfersModel}
 */
const createInboundTransfersModel = (ctx) => new InboundTransfersModel({
    ...ctx.state.conf,
    ...ctx.state.path?.params?.dfspId && {
        dfspId: ctx.state.path.params.dfspId,
        backendEndpoint: `${ctx.state.conf.backendEndpoint}/${ctx.state.path.params.dfspId}`
    },
    cache: ctx.state.cache,
    logger: ctx.state.logger,
    wso2: ctx.state.wso2,
    resourceVersions: ctx.resourceVersions,
    metricsClient: ctx.state.metricsClient,
});

const prepareResponse = ctx => {
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

const { TransformFacades } = require('@mojaloop/ml-schema-transformer-lib');

/**
 * Handles a GET /authorizations/{id} request
 */
const getAuthorizationsById = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const authId = ctx.state.path.params.ID;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getAuthorizations(authId, sourceFspId);

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled GET /parties/{idType}/{idValue} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /parties/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a GET /participants/{idType}/{idValue} request
 */
const getParticipantsByTypeAndId = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const subIdValue = ctx.state.path.params.SubId;
    // kick off an asynchronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getParticipants(idType, idValue, subIdValue, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled GET /participants/{idType}/{idValue}');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /participants/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};


/**
 * Handles a GET /parties/{idType}/{idValue} request
 */
const getPartiesByTypeAndId = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const subIdValue = ctx.state.path.params.SubId;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            const response = await model.getParties(idType, idValue, subIdValue, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled GET /parties/{idType}/{idValue} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /parties/{idType}/{idValue}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};


/**
 * Handles a POST /parties/{idType}/{idValue} request
 */
const postPartiesByTypeAndId = (ctx) => {
    // creation of parties not supported by SDK
    ctx.response.status = ReturnCodes.NOTIMPLEMEMNTED.CODE;
    ctx.response.body = '';
};


/**
 * Handles a POST /quotes request
 */
const postQuotes = async (ctx) => {
    let quoteRequest = {};

    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 post quotes body to FSPIOP');
        // store the original request body in the context for later use
        quoteRequest.isoPostQuote = ctx.request.body;
        const target = await TransformFacades.FSPIOPISO20022.quotes.post({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const sourceFspId = ctx.request.headers['fspiop-source'];
    quoteRequest.body = { ...ctx.request.body };
    quoteRequest.headers = { ...ctx.request.headers };

    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            const response = await model.quoteRequest(quoteRequest, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled POST /quotes request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling POST /quotes');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};


/**
 * Handles a POST /transfers request
 */
const postTransfers = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 post transfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.transfers.post({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const sourceFspId = ctx.request.headers['fspiop-source'];
    const transferRequest = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers },
    };
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.prepareTransfer(transferRequest, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled POST /transfers request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling POST /transfers');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a GET /transfers/{ID} request
 */
const getTransfersById = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const transferId = ctx.state.path.params.ID;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getTransfer(transferId, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({response}).
                debug('Inbound transfers model handled GET /transfers/{ID} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /transfers/{ID}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a POST /transactionRequests request
 */
const postTransactionRequests = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const transactionRequest = { ...ctx.request.body };
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.transactionRequest(transactionRequest, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled POST /transactionRequests request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling POST /transactionRequests');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a PUT /authorizations/{id}. This is a response to a GET /authorizations/{ID}
 * request.
 */
const putAuthorizationsById = async (ctx) => {
    const idValue = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };

    // publish an event onto the cache for subscribers to action
    const cacheId = `otp_${idValue}`;
    // publish an event onto the cache for subscribers to action
    await ctx.state.cache.publish(cacheId, {
        type: 'authorizationsResponse',
        data
    });
    ctx.response.status = ReturnCodes.OK.CODE;
};


/**
 * Handles a PUT /participants/{ID}. This is a response to a POST /participants request
 */
const putParticipantsById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const participantId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`ac_${participantId}`, {
        type: 'accountsCreationSuccessfulResponse',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};


/**
 * Handles a PUT /participants/{ID}/error. This is an error response to a POST /participants request
 */
const putParticipantsByIdError = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const participantId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`ac_${participantId}`, {
        type: 'accountsCreationErrorResponse',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};


/**
 * Handles a PUT /participants/{idType}/{idValue} request
 */
const putParticipantsByTypeAndId = async (ctx) => {
    // Allow putParticipants only for testing purpose when `AUTO_ACCEPT_PARTICIPANTS_PUT` env variable is set to true.
    if(ctx.state.conf.autoAcceptParticipantsPut){
        const idType = ctx.state.path.params.Type;
        const idValue = ctx.state.path.params.ID;
        const idSubValue = ctx.state.path.params.SubId;
        const data = {
            body: { ...ctx.request.body },
            headers: { ...ctx.request.headers }
        };

        // publish an event onto the cache for subscribers to action
        let cacheId = `${idType}_${idValue}` + (idSubValue ? `_${idSubValue}` : '');
        const message = { data };

        // We need to determine if this callback is a response to either a GET/POST /participants
        // or DELETE /participants/{Type}/{ID}/{SubId} request
        const adCacheId = `ad_${cacheId}`;
        if (ctx.state.cache._callbacks[adCacheId]) {
            cacheId = adCacheId;
            message.type = 'accountDeletionSuccessfulResponse';
        }

        await ctx.state.cache.publish(cacheId, message);
        ctx.response.status = ReturnCodes.OK.CODE;
    } else {
        // SDK does not make participants requests so we should not expect any calls to this method
        ctx.response.status = ReturnCodes.NOTIMPLEMEMNTED.CODE;
        ctx.response.body = '';
    }
};


/**
 * Handles a PUT /participants/{Type}/{ID}/{SubId}/error request.
 * This is an error response to a GET /participants/{Type}/{ID}/{SubId} or
 * DELETE /participants/{Type}/{ID}/{SubId} request
 */
const putParticipantsByTypeAndIdError = async(ctx) => {
    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const idSubValue = ctx.state.path.params.SubId;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    // publish an event onto the cache for subscribers to action
    // note that we publish the event the same way we publish a success PUT
    // the subscriber will notice the body contains an errorInformation property
    // and recognise it as an error response
    let cacheId = `${idType}_${idValue}` + (idSubValue ? `_${idSubValue}` : '');
    const message = { data };

    // We need to determine if this callback is a response to either a GET/POST /participants
    // or DELETE /participants/{Type}/{ID}/{SubId} request
    const adCacheId = `ad_${cacheId}`;
    if (ctx.state.cache._callbacks[adCacheId]) {
        cacheId = adCacheId;
        message.type = 'accountDeletionErrorResponse';
    }

    await ctx.state.cache.publish(cacheId, message);

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};


/**
 * Handles a PUT /parties/{idType}/{IdValue}. This is a response to a GET /parties
 * request.
 */
const putPartiesByTypeAndId = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 put parties body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.parties.put({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const idSubValue = ctx.state.path.params.SubId;
    const message = {
        body: { ...ctx.request.body },
        headers: {...ctx.request.headers}
    };

    // publish an event onto the cache for subscribers to finish the action
    await PartiesModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message,
        args: {
            type: idType,
            id: idValue,
            subId: idSubValue
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PUT /quotes/{ID}. This is a response to a POST /quotes request
 */
const putQuoteById = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        ctx.request.originalIso20022QuoteResponse = ctx.request.body;
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 put quotes body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.quotes.put({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    // TODO: refactor legacy models to use QuotesModel
    // - OutboundRequestToPayTransferModel
    // - OutboundTransfersModel
    // publish an event onto the cache for subscribers to action
    const quoteId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers },
        originalIso20022QuoteResponse: { ...ctx.request.originalIso20022QuoteResponse }
    };
    await ctx.state.cache.publish(`qt_${quoteId}`, {
        type: 'quoteResponse',
        data
    });

    // duplicate publication until legacy code refactored
    await QuotesModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message: data,
        args: {
            quoteId
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};


/**
 * Handles a PUT /quotes/{ID}/error request. This is an error response to a POST /quotes request
 */
const putQuotesByIdError = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 putError quotes body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.quotes.putError({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    // TODO: refactor legacy models to use QuotesModel
    // - OutboundRequestToPayTransferModel
    // - OutboundTransfersModel
    // publish an event onto the cache for subscribers to action
    const quoteId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`qt_${quoteId}`, {
        type: 'quoteResponseError',
        data
    });

    // duplicate publication until legacy code refactored
    await QuotesModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message: data.body,
        args: {
            quoteId
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};


/**
 * Handles a GET /quotes/{ID}
 */
const getQuoteById = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const quoteId = ctx.state.path.params.ID;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getQuoteRequest(quoteId, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled GET /quotes request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /quotes');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 200
    ctx.response.status = ReturnCodes.OK.CODE;

};

/**
 * Handles a PUT /transactionRequests/{ID}. This is a response to a POST /transactionRequests request
 */
const putTransactionRequestsById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const transactionRequestId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    // If there are no subscribers, send a callback
    const subscribersObj = await ctx.state.cache.getSubscribers(`txnreq_${transactionRequestId}`);
    if(!subscribersObj) {
        const sourceFspId = ctx.request.headers['fspiop-source'];
        const putTransactionRequest = {
            body: { ...ctx.request.body },
            headers: { ...ctx.request.headers },
        };
        // kick off an asyncronous operation to handle the request
        (async () => {
            try {
                // use the transfers model to execute asynchronous stages with the switch
                const model = createInboundTransfersModel(ctx);

                // use the model to handle the request
                const response = await model.putTransactionRequest(
                    putTransactionRequest, transactionRequestId, sourceFspId, extractTraceHeaders(ctx)
                );

                // log the result
                ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled PUT /transactionRequests/{ID} request');
            }
            catch(err) {
                // nothing we can do if an error gets thrown back to us here apart from log it and continue
                ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling PUT /transactionRequests/{ID}');
            }
        })();
    } else {
        await ctx.state.cache.publish(`txnreq_${transactionRequestId}`, {
            type: 'transactionRequestResponse',
            data
        });
    }

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PUT /transactionRequests/{ID}/error. This is a response to a POST /transactionRequests request
 */
const putTransactionRequestsByIdError = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const transactionRequestId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`txnreq_${transactionRequestId}`, {
        type: 'transactionRequestResponseError',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PUT /transfers/{ID}. This is a response to a POST|GET /transfers request
 */
const putTransfersById = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 put transfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.transfers.put({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    // TODO: refactor legacy models to use TransfersModel
    // - OutboundRequestToPayTransferModel
    // - OutboundTransfersModel
    // publish an event onto the cache for subscribers to action
    const transferId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`tf_${transferId}`, {
        type: 'transferFulfil',
        data
    });

    await TransfersModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message: data,
        args: {
            transferId,
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PATCH /transfers/{ID} from the Switch to Payee for successful transfer
 */
const patchTransfersById = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 patch transfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.transfers.patch({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const req = {
        headers: { ...ctx.request.headers },
        data: { ...ctx.request.body }
    };
    const idValue = ctx.state.path.params.ID;

    // use the transfers model to execute asynchronous stages with the switch
    const model = createInboundTransfersModel(ctx);

    // sends notification to the payee fsp
    const response = await model.sendNotificationToPayee(req.data, idValue);

    // log the result
    ctx.state.logger.isDebugEnabled && ctx.state.logger.push({response}).
        debug('Inbound transfers model handled PATCH /transfers/{ID} request');
};

/**
 * Handles a PUT /parties/{Type}/{ID}/error request. This is an error response to a GET /parties/{Type}/{ID} request
 */
const putPartiesByTypeAndIdError = async(ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 putError parties body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.parties.putError({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const idType = ctx.state.path.params.Type;
    const idValue = ctx.state.path.params.ID;
    const idSubValue = ctx.state.path.params.SubId;
    const message = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    // publish an event onto the cache for subscribers to action
    // note that we publish the event the same way we publish a success PUT
    // the subscriber will notice the body contains an errorInformation property
    // and recognizes it as an error response
    await PartiesModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message,
        args: {
            type: idType,
            id: idValue,
            subId: idSubValue
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

/**
 * Handles a PUT /transfers/{ID}/error. This is an error response to a POST /transfers request
 */
const putTransfersByIdError = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        // we need to transform the incoming request body from iso20022 to fspiop
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 putError transfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.transfers.putError({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    // TODO: refactor legacy models to use TransfersModel
    // - OutboundRequestToPayTransferModel
    // - OutboundTransfersModel
    // publish an event onto the cache for subscribers to action
    const transferId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`tf_${transferId}`, {
        type: 'transferError',
        data
    });

    await TransfersModel.triggerDeferredJob({
        cache: ctx.state.cache,
        message: data,
        args: {
            transferId,
        }
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

/**
 * Handles a GET /bulkQuotes/{ID} request
 */
const getBulkQuotesById = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const bulkQuoteId = ctx.state.path.params.ID;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getBulkQuote(bulkQuoteId, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({response}).
                debug('Inbound transfers model handled GET /bulkQuotes/{ID} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /bulkQuotes/{ID}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a POST /bulkQuotes request
 */
const postBulkQuotes = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const bulkQuoteRequest = { ...ctx.request.body };
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.bulkQuoteRequest(bulkQuoteRequest, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled POST /bulkQuotes request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling POST /bulkQuotes');
        }
    })();

    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a PUT /bulkQuotes/{ID}. This is a response to a POST /bulkQuotes request
 */
const putBulkQuotesById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const bulkQuotesId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`bulkQuote_${bulkQuotesId}`, {
        type: 'bulkQuoteResponse',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PUT /bulkQuotes/{ID}/error request. This is an error response to a POST /bulkQuotes request
 */
const putBulkQuotesByIdError = async(ctx) => {
    // publish an event onto the cache for subscribers to action
    const bulkQuotesId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`bulkQuote_${bulkQuotesId}`, {
        type: 'bulkQuoteResponseError',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

/**
 * Handles a GET /bulkTransfers/{ID} request
 */
const getBulkTransfersById = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const bulkTransferId = ctx.state.path.params.ID;
    // kick off an asyncronous operation to handle the request
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.getBulkTransfer(bulkTransferId, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({response}).
                debug('Inbound transfers model handled GET /bulkTransfers/{ID} request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling GET /bulkTransfers/{ID}');
        }
    })();

    // Note that we will have passed request validation, JWS etc... by this point
    // so it is safe to return 202
    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a POST /bulkTransfers request
 */
const postBulkTransfers = async (ctx) => {
    const sourceFspId = ctx.request.headers['fspiop-source'];
    const bulkPrepareRequest = { ...ctx.request.body };
    (async () => {
        try {
            // use the transfers model to execute asynchronous stages with the switch
            const model = createInboundTransfersModel(ctx);

            // use the model to handle the request
            const response = await model.prepareBulkTransfer(bulkPrepareRequest, sourceFspId, extractTraceHeaders(ctx));

            // log the result
            ctx.state.logger.isDebugEnabled && ctx.state.logger.push({ response }).debug('Inbound transfers model handled POST /bulkTransfers request');
        }
        catch(err) {
            // nothing we can do if an error gets thrown back to us here apart from log it and continue
            ctx.state.logger.isErrorEnabled && ctx.state.logger.push({ err }).error('Error handling POST /bulkTransfers');
        }
    })();

    ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    ctx.response.body = '';
};

/**
 * Handles a PUT /bulkTransfers/{ID}. This is a response to a POST /bulkTransfers request
 */
const putBulkTransfersById = async (ctx) => {
    // publish an event onto the cache for subscribers to action
    const bulkTransfersId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`bulkTransfer_${bulkTransfersId}`, {
        type: 'bulkTransferResponse',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

/**
 * Handles a PUT /bulkTransfers/{ID}/error request. This is an error response to a POST /bulkTransfers request
 */
const putBulkTransfersByIdError = async(ctx) => {
    // publish an event onto the cache for subscribers to action
    const bulkTransfersId = ctx.state.path.params.ID;
    const data = {
        body: { ...ctx.request.body },
        headers: { ...ctx.request.headers }
    };
    await ctx.state.cache.publish(`bulkTransfer_${bulkTransfersId}`, {
        type: 'bulkTransferResponseError',
        data
    });

    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

const healthCheck = async(ctx) => {
    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

const postFxQuotes = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 post fxQuotes body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.fxQuotes.post({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const { body, headers, sourceFspId } = extractBodyHeadersSourceFspId(ctx);
    const { logger } = ctx.state;
    const logPrefix = 'Handling POST fxQuotes request';

    const model = createInboundTransfersModel(ctx);

    model.postFxQuotes({ body, headers }, sourceFspId, extractTraceHeaders(ctx))
        .then(response => logger.push({ response }).debug(`${logPrefix} is done`))
        .catch(err => logger.push({ err }).error(`${logPrefix} error`));

    prepareResponse(ctx);
};

/**
 * Create a handler for PUT /fxQuotes/{ID} and PUT /fxQuotes/{ID}/error routes
 *
 * @param success {boolean} - false is for handling error callback response
 */
const createPutFxQuotesHandler = (success) => async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        const method = success ? 'put' : 'putError';
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug(`Transforming incoming ISO20022 ${method} fxQuotes body to FSPIOP`);
        const target = await TransformFacades.FSPIOPISO20022.fxQuotes[method]({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const { body, headers } = extractBodyHeadersSourceFspId(ctx);
    const { ID } = ctx.state.path.params;

    const channel = `${CacheKeyPrefixes.FX_QUOTE_CALLBACK_CHANNEL}_${ID}`;
    await ctx.state.cache.publish(channel, {
        success,
        data: { body, headers },
        type: `fxQuotesResponse${success ? '' : 'Error'}`
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

const postFxTransfers = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 post fxTransfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.fxTransfers.post({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const { body, headers, sourceFspId } = extractBodyHeadersSourceFspId(ctx);
    const { logger } = ctx.state;
    const logPrefix = 'Handling POST fxTransfers request';

    const model = createInboundTransfersModel(ctx);
    model.postFxTransfers({ body, headers }, sourceFspId, extractTraceHeaders(ctx))
        .then(response => logger.push({ response }).debug(`${logPrefix} is done`))
        .catch(err => logger.push({ err }).error(`${logPrefix} error`));

    prepareResponse(ctx);
};

const patchFxTransfersById = async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        ctx.state.logger.push(ctx.request.body).debug('Transforming incoming ISO20022 patch fxTransfers body to FSPIOP');
        const target = await TransformFacades.FSPIOPISO20022.fxTransfers.patch({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const data = { ...ctx.request.body };
    const idValue = ctx.state.path.params.ID;

    const model = createInboundTransfersModel(ctx);
    const response = await model.sendFxPutNotificationToBackend(data, idValue);

    ctx.state.logger.push({ response }).debug('Inbound Transfers model handled PATCH /fxTransfers/{ID} request');
};

/**
 * Create a handler for PUT /fxTransfers/{ID} and PUT /fxTransfers/{ID}/error routes
 *
 * @param success {boolean} - false is for handling error callback response
 */
const createPutFxTransfersHandler = (success) => async (ctx) => {
    if (ctx.state.conf.isIsoApi) {
        const method = success ? 'put' : 'putError';
        ctx.state.logger.isDebugEnabled && ctx.state.logger.push(ctx.request.body).debug(`Transforming incoming ISO20022 ${method} fxTransfers body to FSPIOP`);
        const target = await TransformFacades.FSPIOPISO20022.fxTransfers[method]({ body: ctx.request.body }, { rollUpUnmappedAsExtensions: true });
        ctx.request.body = target.body;
    }

    const { body, headers } = extractBodyHeadersSourceFspId(ctx);
    const { ID } = ctx.state.path.params;

    const channel = `${CacheKeyPrefixes.FX_TRANSFER_CALLBACK_CHANNEL}_${ID}`;
    await ctx.state.cache.publish(channel, {
        success,
        data: { body, headers },
        type: `fxTransfersResponse${success ? '' : 'Error'}`
    });

    ctx.response.status = ReturnCodes.OK.CODE;
};

const handlePostPing = (ctx) => {
    const { jwsPingValidationResult, conf, logger, wso2 } = ctx.state;
    const { sourceFspId, body, headers } = extractBodyHeadersSourceFspId(ctx);

    const model = new InboundPingModel({
        ...conf,
        resourceVersions: ctx.resourceVersions,
        logger,
        wso2,
    });
    model.postPing({ jwsPingValidationResult, sourceFspId, body, headers })
        .catch(err => logger.error('error in handlePostPing:', err));

    prepareResponse(ctx);
};

module.exports = {
    '/': {
        get: healthCheck
    },
    '/authorizations/{ID}': {
        get: getAuthorizationsById,
        put: putAuthorizationsById
    },
    '/bulkQuotes': {
        post: postBulkQuotes
    },
    '/bulkQuotes/{ID}': {
        get: getBulkQuotesById,
        put: putBulkQuotesById
    },
    '/bulkQuotes/{ID}/error': {
        put: putBulkQuotesByIdError
    },
    '/bulkTransfers': {
        post: postBulkTransfers
    },
    '/bulkTransfers/{ID}': {
        get: getBulkTransfersById,
        put: putBulkTransfersById
    },
    '/bulkTransfers/{ID}/error': {
        put: putBulkTransfersByIdError
    },
    '/participants/{ID}': {
        put: putParticipantsById
    },
    '/participants/{Type}/{ID}': {
        put: putParticipantsByTypeAndId,
        get: getParticipantsByTypeAndId
    },
    '/participants/{Type}/{ID}/error': {
        put: putParticipantsByTypeAndIdError
    },
    '/participants/{Type}/{ID}/{SubId}': {
        put: putParticipantsByTypeAndId,
        get: getParticipantsByTypeAndId
    },
    '/participants/{Type}/{ID}/{SubId}/error': {
        put: putParticipantsByTypeAndIdError
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
        put: putQuoteById,
        get: getQuoteById
    },
    '/quotes/{ID}/error': {
        put: putQuotesByIdError
    },
    '/transfers': {
        post: postTransfers
    },
    '/transfers/{ID}': {
        get: getTransfersById,
        put: putTransfersById,
        patch: patchTransfersById
    },
    '/transfers/{ID}/error': {
        put: putTransfersByIdError
    },
    '/transactionRequests': {
        post: postTransactionRequests
    },
    '/transactionRequests/{ID}': {
        put: putTransactionRequestsById
    },
    '/transactionRequests/{ID}/error': {
        put: putTransactionRequestsByIdError
    },
    '/fxQuotes': {
        post: postFxQuotes
    },
    '/fxQuotes/{ID}': {
        put: createPutFxQuotesHandler(true)
    },
    '/fxQuotes/{ID}/error': {
        put: createPutFxQuotesHandler(false)
    },
    '/fxTransfers': {
        post: postFxTransfers
    },
    '/fxTransfers/{ID}': {
        patch: patchFxTransfersById,
        put: createPutFxTransfersHandler(true)
    },
    '/fxTransfers/{ID}/error': {
        put: createPutFxTransfersHandler(false)
    },
    '/ping': {
        post: handlePostPing
    },
};