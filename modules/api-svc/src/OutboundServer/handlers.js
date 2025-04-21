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

 * Infitx
 - Steven Oderayi <steven.oderayi@infitx.com>

 --------------
 ******/
'use strict';

const {
    AccountsModel,
    OutboundTransfersModel,
    OutboundBulkTransfersModel,
    OutboundRequestToPayTransferModel,
    OutboundRequestToPayModel,
    OutboundBulkQuotesModel,
    PartiesModel,
    QuotesModel,
    TransfersModel
} = require('../lib/model');
const {
    SDKOutboundBulkRequestReceivedDmEvt,
    SDKOutboundBulkAcceptPartyInfoReceivedDmEvt,
    SDKOutboundBulkAcceptQuoteReceivedDmEvt,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const { Enum } = require('@mojaloop/central-services-shared');
const { ReturnCodes } = Enum.Http;

/**
 * Error handling logic shared by outbound API handlers
 */
const handleError = (method, err, ctx, stateField) => {
    ctx.state.logger.push({ error: err, stateField }).error(`Error handling ${method}`);
    ctx.response.status = err.httpStatusCode || ReturnCodes.INTERNALSERVERERRROR.CODE;
    ctx.response.body = {
        message: err.message || 'Unspecified error',
        [stateField]: err[stateField] || {},
        statusCode: (err.httpStatusCode || 500).toString()
    };
    if(err[stateField]
        && err[stateField].lastError
        && err[stateField].lastError.mojaloopError
        && err[stateField].lastError.mojaloopError.errorInformation
        && err[stateField].lastError.mojaloopError.errorInformation.errorCode) {

        // by default we set the statusCode property of the error body to be that of any model state lastError
        // property containing a mojaloop API error structure. This means the caller does not have to inspect
        // the structure of the response object in depth to ascertain an underlying mojaloop API error code.
        const errorInformation = err[stateField].lastError.mojaloopError.errorInformation;
        ctx.response.body.statusCode = errorInformation.errorCode;
        ctx.state.logger.push({ errorInformation }).warn('errorInformation:');

        // if we have been configured to use an error extensionList item as status code, look for it and use
        // it if it is present...
        if(ctx.state.conf.outboundErrorStatusCodeExtensionKey
            && errorInformation.extensionList
            && Array.isArray(errorInformation.extensionList.extension)) {

            // search the extensionList array for a key that matches what we have been configured to look for...
            // the first one will do - spec is a bit loose on duplicate keys...
            const extensionItem = errorInformation.extensionList.extension.find(e => {
                return e.key === ctx.state.conf.outboundErrorStatusCodeExtensionKey;
            });

            if(extensionItem) {
                ctx.response.body.statusCode = extensionItem.value;
            }
        }
    }
};

const handleTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'transferState');

const handleBulkTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'bulkTransferState');

const handleBulkTransactionError = (method, err, ctx) =>
    handleError(method, err, ctx, 'bulkTransactionState');

const handleBulkQuoteError = (method, err, ctx) =>
    handleError(method, err, ctx, 'bulkQuoteState');

const handleAccountsError = (method, err, ctx) =>
    handleError(method, err, ctx, 'executionState');

const handleRequestToPayError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestToPayState');

const handleRequestToPayTransferError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestToPayTransferState');

const handleRequestPartiesInformationError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestPartiesInformationState');

const handleRequestQuotesInformationError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestQuotesInformationState');

const handleRequestSimpleTransfersInformationError = (method, err, ctx) =>
    handleError(method, err, ctx, 'requestSimpleTransfersInformationState');


const createOutboundTransfersModel = (ctx) => new OutboundTransfersModel({
    ...ctx.state.conf,
    ...(ctx.state.path?.params?.dfspId && { dfspId: ctx.state.path.params.dfspId }),
    cache: ctx.state.cache,
    logger: ctx.state.logger,
    wso2: ctx.state.wso2,
    metricsClient: ctx.state.metricsClient,
});

const createOutboundBulkTransfersModel = (ctx) => new OutboundBulkTransfersModel({
    ...ctx.state.conf,
    ...(ctx.state.path?.params?.dfspId && { dfspId: ctx.state.path.params.dfspId }),
    cache: ctx.state.cache,
    logger: ctx.state.logger,
    wso2: ctx.state.wso2,
});

/**
 * Handler for outbound transfer request initiation
 */
const postTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let transferRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = createOutboundTransfersModel(ctx);

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleTransferError('postTransfers', err, ctx);
    }
};

/**
 * Handler for outbound transfer request
 */
const getTransfers = async (ctx) => {
    try {
        let transferRequest = {
            ...ctx.request.body,
            transferId: ctx.state.path.params.transferId,
            currentState: 'getTransfer',
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = createOutboundTransfersModel(ctx);

        // initialize the transfer model and start it running
        await model.initialize(transferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleTransferError('getTransfers', err, ctx);
    }
};

/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = createOutboundTransfersModel(ctx);

        // TODO: check the incoming body to reject party or quote when requested to do so

        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transferId);

        const response = await model.run(ctx.request.body);

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleTransferError('putTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk transfer request
 */
const postBulkTransfers = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let bulkTransferRequest = {
            ...ctx.request.body
        };

        // use the bulk transfers model to execute asynchronous stages with the switch
        const model = createOutboundBulkTransfersModel(ctx);

        await model.initialize(bulkTransferRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkTransferError('postBulkTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk transfer request
 */
const getBulkTransfers = async (ctx) => {
    try {
        const bulkTransferRequest = {
            ...ctx.request.body,
            bulkTransferId: ctx.state.path.params.bulkTransferId,
            currentState: 'getBulkTransfer',
        };

        // use the bulk transfers model to execute asynchronous stages with the switch
        const model = createOutboundBulkTransfersModel(ctx);

        await model.initialize(bulkTransferRequest);
        const response = await model.getBulkTransfer();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkTransferError('getBulkTransfers', err, ctx);
    }
};

/**
 * Handler for outbound bulk transaction request
 */
const postBulkTransactions = async (ctx) => {
    try {
        const msg = new SDKOutboundBulkRequestReceivedDmEvt({
            bulkRequest: ctx.request.body,
            headers: [ctx.request.headers],
            timestamp: Date.now(),
        });
        await ctx.state.eventProducer.sendDomainEvent(msg);
        ctx.state.eventLogger.info(`Sent domain event ${msg.getName()}`);

        ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    }
    catch (err) {
        return handleBulkTransactionError('postBulkTransactions', err, ctx);
    }
};

/**
 * Handler for outbound bulk transfer request
 */
const putBulkTransactions = async (ctx) => {
    try {
        let msg;

        if (ctx.request.body.individualTransfers[0]?.hasOwnProperty('acceptParty')) {
            msg = new SDKOutboundBulkAcceptPartyInfoReceivedDmEvt({
                bulkId: ctx.state.path.params.bulkTransactionId,
                bulkTransactionContinuationAcceptParty: ctx.request.body,
                headers: [ctx.request.headers],
                timestamp: Date.now(),
            });
        } else if (ctx.request.body.individualTransfers[0]?.hasOwnProperty('acceptQuote')) {
            msg = new SDKOutboundBulkAcceptQuoteReceivedDmEvt({
                bulkId: ctx.state.path.params.bulkTransactionId,
                bulkTransactionContinuationAcceptQuote: ctx.request.body,
                headers: [ctx.request.headers],
                timestamp: Date.now(),
            });
        }

        if (msg) {
            await ctx.state.eventProducer.sendDomainEvent(msg);
            ctx.state.eventLogger.info(`Sent domain event ${msg.getName()}`);
        }

        ctx.response.status = ReturnCodes.ACCEPTED.CODE;
    }
    catch (err) {
        return handleBulkTransactionError('putBulkTransactions', err, ctx);
    }
};

/**
 * Handler for outbound bulk quote request
 */
const postBulkQuotes = async (ctx) => {
    try {
        let bulkQuoteRequest = {
            ...ctx.request.body
        };

        // use the bulk quotes model to execute asynchronous request with the switch
        const model = new OutboundBulkQuotesModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        await model.initialize(bulkQuoteRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkQuoteError('postBulkQuotes', err, ctx);
    }
};

/**
 * Handler for outbound bulk quote request
 */
const getBulkQuoteById = async (ctx) => {
    try {
        const bulkQuoteRequest = {
            ...ctx.request.body,
            bulkQuoteId: ctx.state.path.params.bulkQuoteId,
            currentState: 'getBulkQuote',
        };

        // use the bulk quotes model to execute asynchronous stages with the switch
        const model = new OutboundBulkQuotesModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        await model.initialize(bulkQuoteRequest);
        const response = await model.getBulkQuote();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch (err) {
        return handleBulkQuoteError('getBulkQuoteById', err, ctx);
    }
};

/**
 * Handler for outbound transfer request initiation
 */
const postRequestToPayTransfer = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let requestToPayTransferRequest = {
            ...ctx.request.body
        };

        // use the merchant transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayTransferModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        // initialize the transfer model and start it running
        await model.initialize(requestToPayTransferRequest);
        const response = await model.run();
        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch (err) {
        return handleRequestToPayTransferError('postRequestToPayTransfer', err, ctx);
    }
};

/**
 * Handler for resuming outbound transfers in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptQuote SDK option
 */
const putRequestToPayTransfer = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayTransferModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        // TODO: check the incoming body to reject party or quote when requested to do so
        const data = ctx.request.body;
        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transactionRequestId);
        let response;
        if(data.acceptQuote === true || data.acceptOTP === true) {
            response = await model.run();
        } else {
            response = await model.rejectRequestToPay();
        }

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleTransferError('putRequestToPayTransfer', err, ctx);
    }
};


/**
 * Handler for outbound participants request initiation
 */
const postAccounts = async (ctx) => {
    try {
        const model = new AccountsModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        const state = {
            accounts: ctx.request.body,
        };

        // initialize the accounts model and run it
        await model.initialize(state);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleAccountsError('postAccounts', err, ctx);
    }
};

/**
 * Handler for outbound accounts deletion request
 */
const deleteAccountByTypeAndId = async (ctx) => {
    try {
        const model = new AccountsModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        const args = {
            currentState: 'deleteAccount',
            idType: ctx.state.path.params.Type,
            idValue: ctx.state.path.params.ID,
            subIdOrType: ctx.state.path.params.SubId,
        };

        // initialize the accounts model and run it
        await model.initialize(args);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleAccountsError('deleteAccountByTypeAndId', err, ctx);
    }
};

const postRequestToPay = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        let requestToPayInboundRequest = {
            ...ctx.request.body
        };

        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        // initialize the transfer model and start it running
        await model.initialize(requestToPayInboundRequest);
        const response = await model.run();

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;

    } catch(err) {
        return handleRequestToPayError('requestToPayInboundRequest', err, ctx);
    }
};

/**
 * Handler for resuming outbound requestToPay in scenarios where two-step transfers are enabled
 * by disabling the autoAcceptParty SDK option
 */
const putRequestToPay = async (ctx) => {
    try {
        // this requires a multi-stage sequence with the switch.
        // use the transfers model to execute asynchronous stages with the switch
        const model = new OutboundRequestToPayModel({
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        });

        // TODO: check the incoming body to reject party or quote when requested to do so
        const data = ctx.request.body;
        // load the transfer model from cache and start it running again
        await model.load(ctx.state.path.params.transactionRequestId);
        let response;
        if(data.acceptParty === true) {
            response = await model.run();
        } else {
            response = await model.rejectRequestToPay();
        }

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    }
    catch(err) {
        return handleTransferError('putRequestToPay', err, ctx);
    }
};

const healthCheck = async (ctx) => {
    ctx.response.status = ReturnCodes.OK.CODE;
    ctx.response.body = '';
};

const getPartiesByTypeAndId = async (ctx) => {
    const type = ctx.state.path.params.Type;
    const id = ctx.state.path.params.ID;
    const subId = ctx.state.path.params.SubId;

    const args = { type, id, subId };

    try {
        // prepare config
        const modelConfig = {
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        };

        const cacheKey = PartiesModel.generateKey(args);

        // use the parties model to execute asynchronous stages with the switch
        const model = await PartiesModel.create({}, cacheKey, modelConfig);

        // run model's workflow
        const response = await model.run(args);

        // return the result
        if (response.errorInformation) {
            ctx.response.status = ReturnCodes.NOTFOUND.CODE;
        } else {
            ctx.response.status = ReturnCodes.OK.CODE;
        }
        ctx.response.body = response;
    } catch (err) {
        return handleRequestPartiesInformationError('getPartiesByTypeAndId', err, ctx);
    }
};

const postQuotes = async (ctx) => {
    const quote = { ...ctx.request.body.quotesPostRequest };
    const fspId = ctx.request.body.fspId;
    const args = { quoteId: quote.quoteId, fspId, quote };

    try {
        // prepare config
        const modelConfig = {
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        };

        const cacheKey = QuotesModel.generateKey(args);

        // use the parties model to execute asynchronous stages with the switch
        const model = await QuotesModel.create({}, cacheKey, modelConfig);

        // run model's workflow
        const response = await model.run(args);

        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    } catch (err) {
        return handleRequestQuotesInformationError('postQuotes', err, ctx);
    }
};

const postSimpleTransfers = async (ctx) => {
    const transfer = { ...ctx.request.body.transfersPostRequest };
    const fspId = ctx.request.body.fspId;
    const args = { transferId: transfer.transferId, fspId, transfer };

    try {
        // prepare config
        const modelConfig = {
            ...ctx.state.conf,
            ...ctx.state.path?.params?.dfspId && {dfspId: ctx.state.path.params.dfspId},
            cache: ctx.state.cache,
            logger: ctx.state.logger,
            wso2: ctx.state.wso2,
        };

        const cacheKey = TransfersModel.generateKey(args);

        // use the parties model to execute asynchronous stages with the switch
        const model = await TransfersModel.create({}, cacheKey, modelConfig);

        // run model's workflow
        const response = await model.run(args);
        // return the result
        ctx.response.status = ReturnCodes.OK.CODE;
        ctx.response.body = response;
    } catch (err) {
        return handleRequestSimpleTransfersInformationError('postSimpleTransfers', err, ctx);
    }
};

module.exports = {
    '/': {
        get: healthCheck
    },
    '/transfers': {
        post: postTransfers
    },
    '/transfers/{transferId}': {
        get: getTransfers,
        put: putTransfers
    },
    '/bulkTransfers': {
        post: postBulkTransfers
    },
    '/bulkTransfers/{bulkTransferId}': {
        get: getBulkTransfers,
    },
    '/bulkTransactions': {
        post: postBulkTransactions
    },
    '/bulkTransactions/{bulkTransactionId}': {
        put: putBulkTransactions,
    },
    '/bulkQuotes': {
        post: postBulkQuotes,
    },
    '/bulkQuotes/{bulkQuoteId}': {
        get: getBulkQuoteById,
    },
    '/accounts': {
        post: postAccounts,
    },
    '/accounts/{Type}/{ID}': {
        delete: deleteAccountByTypeAndId,
    },
    '/accounts/{Type}/{ID}/{SubId}': {
        delete: deleteAccountByTypeAndId,
    },
    '/requestToPay': {
        post: postRequestToPay
    },
    '/requestToPay/{transactionRequestId}': {
        put: putRequestToPay
    },
    '/requestToPayTransfer': {
        post: postRequestToPayTransfer
    },
    '/requestToPayTransfer/{transactionRequestId}': {
        put: putRequestToPayTransfer
    },
    '/parties/{Type}/{ID}': {
        get: getPartiesByTypeAndId
    },
    '/parties/{Type}/{ID}/{SubId}': {
        get: getPartiesByTypeAndId
    },
    '/quotes': {
        post: postQuotes
    },
    '/simpleTransfers': {
        post: postSimpleTransfers
    }
};
