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
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/
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
    if ( !fspId ) {
        throw new Error('QuotesModel args requires \'fspId\' to be nonempty string');
    }

    if ( !(quote  && typeof(quote) === 'object') ) {
        throw new Error('QuotesModel.requestAction args requires \'quote\' to be specified');
    }
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
        throw new Error('QuotesModel args requires properties \'quote.quoteId\' and \'quoteId\' to be the equal in value');
    }
}

/**
 * @name reformatMessage
 * @description reformats message received from PUB/SUB channel, it is optional method, if not specified identify function is used by default
 * @param {object} message - message received
 * @returns {object} - reformatted message
 */
function reformatMessage(message) {
    return {
        quotes: { ...message }
    };
}

// generate model
const QuotesModel = Async2SyncModel.generate({
    modelName: 'QuotesModel',
    channelNameMethod: channelName,
    requestActionMethod: requestAction,
    argsValidationMethod: argsValidation,
    reformatMessageMethod: reformatMessage
});

module.exports = QuotesModel;

