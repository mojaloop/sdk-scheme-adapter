/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 * Modusbox
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

const { BulkQuotesRequestedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const { OutboundBulkQuotesModel } = require('../../lib/model');
const { BulkQuotesCallbackReceivedDmEvt } = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

module.exports.handleBulkQuotesRequestedDmEvt = async (
    message,
    options,
    logger,
) => {
    const event = BulkQuotesRequestedDmEvt.CreateFromDomainEvent(message);

    try {
        // use the bulk quotes model to execute asynchronous request with the switch
        const model = new OutboundBulkQuotesModel({
            ...options.config,
            cache: options.cache,
            logger: logger,
            wso2: options.wso2Auth,
        });

        await model.initialize(event.request);
        const response = await model.run();

        const bulkQuotesCallbackReceivedDmEvt = new BulkQuotesCallbackReceivedDmEvt({
            bulkId: event.getKey(),
            content: {
                batchId: event.batchId,
                bulkQuoteId: response.bulkQuoteId,
                bulkQuotesResult: response,
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.producer.sendDomainEvent(bulkQuotesCallbackReceivedDmEvt);
    }
    catch (err) {
        logger.push({ err }).log('Error in handleBulkQuotesRequestedDmEvt');
    }
};
