/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';

const Async2SyncModel = require('./Async2SyncModel');


// delegated methods for QuotesModel

/**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {object} - args
 *   @param {string} args.quoteId - the quote payload
 *   @param {string} [args.fspId] - ignored if passed - the destination fsp id
 *   @param {string} [args.quote] - ignored if passed - the quote payload
 * @returns {string} - the pub/sub channel name
 */
function channelName({ quoteId /* ,fspId, quote - are not used here */ }) {
    const tokens = ['quotes', quoteId ];
    return tokens.map(x => `${x}`).join('-');
}

/**
 * @name requestAction
 * @description invokes the call to switch
 * @param {object} requests - MojaloopRequests instance
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} [args.quoteId] - ignored if passed - the quote I=id
 *   @param {string} args.fspId - the destination fsp id
 *   @param {string} args.quote - the quote payload
 */
function requestAction(requests, { /* quoteId - is not used here */ fspId, quote }) {
    return requests.postQuotes(quote, fspId);
}

/**
 * @name argsValidationMethod
 * @description makes validation of args object, invoked in `run, triggerDeferredJob, generateKey` methods to ensure everything is going well
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} args.quoteId - the party type
 *   @param {string} [args.fspId] - the destination fsp id
 *   @param {string} [args.quote] - the quote payload
 */
function argsValidation({ quoteId, fspId, quote }) {
    if (!(quoteId && typeof(quoteId) === 'string' && quoteId.length > 0)) {
        throw new Error('QuotesModel args requires \'quoteId\' is nonempty string and mandatory property');
    }
    if (fspId && !(typeof (fspId) === 'string' && fspId.length > 0)) {
        throw new Error('QuotesModel args requires \'fspId\' to be nonempty string');
    }
    if (quote && quote.quoteId !== quoteId) {
        throw new Error('QuotesModel args requires \'quote.quoteId\' to be the equal in value');
    }
}

// generate model 
const QuotesModel = Async2SyncModel.generate({
    modelName: 'QuotesModel',
    channelNameMethod: channelName,
    requestActionMethod: requestAction,
    argsValidationMethod: argsValidation
});

module.exports = QuotesModel;

