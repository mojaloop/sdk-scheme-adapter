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


// delegated methods for PartiesModel

/**
 * @name channelName
 * @description generates the pub/sub channel name
 * @param {object} - args
 *   @param {string} args.type     - the party type
 *   @param {string} args.id       - the party id
 *   @param {string} [args.subId]  - the optional party subId
 * @returns {string} - the pub/sub channel name
 */
function channelName({ type, id, subId }) {
    const tokens = ['parties', type, id, subId];
    return tokens.map(x => `${x}`).join('-');
}

/**
 * @name requestAction
 * @description invokes the call to switch
 * @param {object} requests - MojaloopRequests instance
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} args.type     - the party type
 *   @param {string} args.id       - the party id
 *   @param {string} [args.subId]  - the optional party subId
 */
function requestAction(requests, { type, id, subId }) {
    return requests.getParties(type, id, subId);
}

/**
 * @name argsValidationMethod
 * @description makes validation of args object, invoked in `run, triggerDeferredJob, generateKey` methods to ensure everything is going well
 * @param {object} requests - MojaloopRequests instance
 * @param {array} args - the arguments passed as object to `run` method
 *   @param {string} args.type     - the party type
 *   @param {string} args.id       - the party id
 *   @param {string} [args.subId]  - the optional party subId
 */
function argsValidation({ type, id, subId }) {
    const channel = channelName({ type, id, subId });
    if (channel.indexOf('-undefined-') != -1) {
        throw new Error('PartiesModel args required at least two string arguments: \'type\' and \'id\'');
    }
}

/**
 * @name reformatMessage
 * @description reformats message received from PUB/SUB channel, it is optional method, if not specified identify function is used by default
 * @param {object} message - message received
 * @returns {object} - reformatted message
 */
function reformatMessage(message) {
    if (message.body.errorInformation) {
        return {
            party: {
                errorInformation: { ...message.body.errorInformation }
            }
        };
    } else {
        return {
            party: {
                body: { ...message.body.party },
                headers: { ...message.headers }
            }
        };
    }
}

// generate model
const PartiesModel = Async2SyncModel.generate({
    modelName: 'PartiesModel',
    channelNameMethod: channelName,
    requestActionMethod: requestAction,
    argsValidationMethod: argsValidation,
    reformatMessageMethod: reformatMessage
});

module.exports = PartiesModel;

