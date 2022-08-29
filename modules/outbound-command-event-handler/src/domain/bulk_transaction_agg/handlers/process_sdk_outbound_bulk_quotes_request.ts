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
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    CommandEventMessage,
    ProcessSDKOutboundBulkQuotesRequestMessage,
    BulkQuotesRequestedMessage
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkBatchInternalState, BulkTransactionInternalState } from '../..';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export async function handleProcessSDKOutboundBulkQuotesRequestMessage(
    message: CommandEventMessage,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkQuotesRequestMessage = message as ProcessSDKOutboundBulkQuotesRequestMessage;
    try {
        logger.info(`Got ProcessSDKOutboundBulkQuotesRequestMessage: bulkId=${processSDKOutboundBulkQuotesRequestMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkQuotesRequestMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkTx = bulkTransactionAgg.getBulkTransaction();

        bulkTx.setTxState(BulkTransactionInternalState.AGREEMENT_PROCESSING);
        await bulkTransactionAgg.setTransaction(bulkTx);

        // Create bulkQuotes batches from individual items with DISCOVERY_ACCEPTED state per FSP and maxEntryConfigPerBatch
        await bulkTransactionAgg.createBatches(options.appConfig.get('MAX_ITEMS_PER_BATCH'));

        // Iterate through batches
        const allBulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();
        for await (const bulkBatchId of allBulkBatchIds) {
            const bulkBatch = await bulkTransactionAgg.getBulkBatchEntityById(bulkBatchId);
            try {
                // Validate the bulkQuotes request schema in the entity before sending the domain event
                bulkBatch.validateBulkQuotesRequest();
                // TODO: Send domain event BulkQuotesRequested
                const msg = new BulkQuotesRequestedMessage({
                    bulkId: bulkTx.id,
                    content: {
                        batchId: bulkBatch.id,
                        request: bulkBatch.bulkQuotesRequest
                    },
                    timestamp: Date.now(),
                    headers: [],
                });
                await options.domainProducer.sendDomainMessage(msg);
                bulkBatch.setState(BulkBatchInternalState.AGREEMENT_PROCESSING);
                await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);
            } catch(err) {
                bulkBatch.setState(BulkBatchInternalState.AGREEMENT_FAILED);
                await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);
            }
        }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    } catch (err: any) {
        logger.info(`Failed to create BulkTransactionAggregate. ${err.message}`);
    }
}
