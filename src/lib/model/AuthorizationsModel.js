/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/

'use strict';

const Async2SyncModel = require('./Async2SyncModel');


// delegated methods for AuthorizationsModel

/**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {object} - args
 *   @param {string} args.transactionRequestId - the transactionRequestId
 *   @param {string} [args.fspId] - ignored if passed - the destination fsp id
 *   @param {string} [args.authorization] - ignored if passed - the authorization payload
 * @returns {string} - the pub/sub channel name
 */
function channelName ({ transactionRequestId /* ,fspId, authorization - are not used here */ }) {
    const tokens = ['authorizations', transactionRequestId];
    return tokens.map(x => `${x}`).join('-');
}

/**
 * @name requestAction
 * @description invokes the call to switch
 * @param {object} requests - MojaloopRequests instance
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} [args.transactionRequestId] -  the transactionRequestId
 *   @param {string} args.fspId - the destination fsp id
 *   @param {string} args.authorization - the authorization
 */
function requestAction (requests, { /* transactionRequestId, not used here */ fspId, authorization }) {
    if (!fspId) {
        throw new Error('AuthorizationsModel args requires \'fspId\' to be nonempty string');
    }
    return requests.postAuthorizations(authorization, fspId);
}

/**
 * @name argsValidationMethod
 * @description makes validation of args object, invoked in `run, triggerDeferredJob, generateKey` methods to ensure everything is going well
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} args.transactionRequestId - the transactionRequestId
 *   @param {string} args.fspId - the destination fsp id
 *   @param {string} [args.authorization] - ignored if passed - the authorization payload
 */
function argsValidation ({ transactionRequestId, fspId /* ,authorization not used here */ }) {
    if (!(transactionRequestId && typeof (transactionRequestId) === 'string' && transactionRequestId.length > 0)) {
        throw new Error('AuthorizationsModel args requires \'transactionRequestId\' is nonempty string and mandatory property');
    }
    if (fspId && !(typeof (fspId) === 'string' && fspId.length > 0)) {
        throw new Error('AuthorizationsModel args requires \'fspId\' to be nonempty string');
    }
}

/**
 * @name reformatMessage
 * @description reformats message received from PUB/SUB channel, it is optional method, if not specified identify function is used by default
 * @param {object} message - message received
 * @returns {object} - reformatted message
 */
function reformatMessage (message) {
    return {
        authorizations: { ...message }
    };
}

// generate model 
const AuthorizationsModel = Async2SyncModel.generate({
    modelName: 'AuthorizationsModel',
    channelNameMethod: channelName,
    requestActionMethod: requestAction,
    argsValidationMethod: argsValidation,
    reformatMessageMethod: reformatMessage
});

module.exports = AuthorizationsModel;