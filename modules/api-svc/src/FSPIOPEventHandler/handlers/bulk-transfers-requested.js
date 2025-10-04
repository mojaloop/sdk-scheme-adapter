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

 * Infitx
 - Kevin Leyow <kevin.leyow@infitx.com>
 --------------
 ******/
const { BulkTransfersRequestedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const { OutboundBulkTransfersModel } = require('../../lib/model');
const { BulkTransfersCallbackReceivedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

module.exports.handleBulkTransfersRequestedDmEvt = async (
    message,
    options,
    logger,
) => {
    const event = BulkTransfersRequestedDmEvt.CreateFromDomainEvent(message);

    try {
        // use the bulk transfers model to execute asynchronous request with the switch
        const model = new OutboundBulkTransfersModel({
            ...options.config,
            cache: options.cache,
            logger: logger,
            oidc: options.oidc,
        });

        await model.initialize(event.request);
        const response = await model.run();

        const bulkTransfersCallbackReceivedDmEvt = new BulkTransfersCallbackReceivedDmEvt({
            bulkId: event.getKey(),
            content: {
                batchId: event.batchId,
                bulkTransfersResult: response,
            },
            timestamp: Date.now(),
            headers: [],
        });

        await options.producer.sendDomainEvent(bulkTransfersCallbackReceivedDmEvt);
    } catch (err) {
        logger.isErrorEnabled && logger.push({ err }).error('Error in handleBulkTransfersRequestedDmEvt');
        const bulkTransfersCallbackReceivedDmEvt = new BulkTransfersCallbackReceivedDmEvt({
            bulkId: event.getKey(),
            content: {
                batchId: event.batchId,
                bulkTransfersErrorResult: {
                    httpStatusCode: err.httpStatusCode,
                    mojaloopError: err.mojaloopError,
                },
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.producer.sendDomainEvent(bulkTransfersCallbackReceivedDmEvt);
    }
};
