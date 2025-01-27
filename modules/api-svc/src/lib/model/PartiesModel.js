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
            errorInformation: { ...message.body.errorInformation }
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

