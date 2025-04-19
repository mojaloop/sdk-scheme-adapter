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
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/
const { PartyInfoRequestedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const { PartiesModel } = require('../../lib/model');
const { PartyInfoCallbackReceivedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const { Errors } = require('@mojaloop/sdk-standard-components');

module.exports.handlePartyInfoRequestedDmEvt = async (
    message,
    options,
    logger,
) => {
    const event = PartyInfoRequestedDmEvt.CreateFromDomainEvent(message);
    const request = event.partyRequest;
    const args = { type: request.partyIdType, id: request.partyIdentifier, subId: request.partySubIdOrType || undefined };

    try {
        // prepare config
        const modelConfig = {
            ...options.config,
            cache: options.cache,
            logger: logger,
            wso2: options.wso2,
        };

        const cacheKey = PartiesModel.generateKey(args);

        // use the parties model to execute asynchronous stages with the switch
        const model = await PartiesModel.create({}, cacheKey, modelConfig);

        // run model's workflow
        const response = await model.run(args);

        const partyInfoCallbackReceivedDmEvt = new PartyInfoCallbackReceivedDmEvt({
            bulkId: event.getKey(),
            content: {
                transferId: event.transferId,
                partyResult: {
                    party: response.party?.body,
                    currentState: response.currentState,
                    ...(response.errorInformation && {
                        errorInformation: response.errorInformation,
                    })
                },
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.producer.sendDomainEvent(partyInfoCallbackReceivedDmEvt);
    } catch (err) {
        logger.isErrorEnabled && logger.push({ error: err }).error('Error in handlePartyInfoRequestedDmEvt');
        const { code, message } = Errors.MojaloopApiErrorCodes.SERVER_TIMED_OUT;
        const partyInfoCallbackReceivedDmEvt = new PartyInfoCallbackReceivedDmEvt({
            bulkId: event.getKey(),
            content: {
                transferId: event.transferId,
                partyErrorResult: {
                    httpStatusCode: err.httpStatusCode,
                    mojaloopError: {
                        errorInformation: {
                            errorCode: code,
                            errorDescription: message
                        },
                    },
                },
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.producer.sendDomainEvent(partyInfoCallbackReceivedDmEvt);
    }
};
