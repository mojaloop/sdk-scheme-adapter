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
    CommandEvent,
    ProcessSDKOutboundBulkTransfersRequestCmdEvt,
    BulkTransfersRequestedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkBatchInternalState, BulkTransactionInternalState } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handleProcessSDKOutboundBulkTransfersRequestCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkTransfersRequestMessage = message as ProcessSDKOutboundBulkTransfersRequestCmdEvt;
    try {
        logger.info(`Got handleProcessSDKOutboundBulkTransfersRequestCmdEvt: bulkId=${processSDKOutboundBulkTransfersRequestMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkTransfersRequestMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkTx = bulkTransactionAgg.getBulkTransaction();

        bulkTx.setTxState(BulkTransactionInternalState.TRANSFERS_PROCESSING);
        await bulkTransactionAgg.setTransaction(bulkTx);

        // Create bulkTransfers batches from individual items with AGREEMENT_ACCEPTED state per FSP and maxEntryConfigPerBatch
        logger.info(`Creating batches for bulkId=${processSDKOutboundBulkTransfersRequestMessage.getKey()}`);
        await bulkTransactionAgg.createBatches(options.appConfig.get('MAX_ITEMS_PER_BATCH'));

        // Iterate through batches
        const allBulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();
        logger.info(`Created ${allBulkBatchIds.length} batches for bulkId=${processSDKOutboundBulkTransfersRequestMessage.getKey()}`);
        for await (const bulkBatchId of allBulkBatchIds) {
            const bulkBatch = await bulkTransactionAgg.getBulkBatchEntityById(bulkBatchId);

            // TODO: add logic for sending transfer batches
            try {
                // Validate the bulkTransfers request schema in the entity before sending the domain event
                bulkBatch.validateBulkTransfersRequest();
                // Send domain event BulkTransfersRequested
                const bulkTransfersRequestedDmEvt = new BulkTransfersRequestedDmEvt({
                    bulkId: bulkTx.id,
                    content: {
                        batchId: bulkBatch.id,
                        request: bulkBatch.bulkTransfersRequest,
                    },
                    timestamp: Date.now(),
                    headers: [],
                });
                await options.domainProducer.sendDomainEvent(bulkTransfersRequestedDmEvt);
                bulkBatch.setState(BulkBatchInternalState.TRANSFERS_PROCESSING);
                await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);
            } catch (err) {
                bulkBatch.setState(BulkBatchInternalState.TRANSFERS_FAILED);
                await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);
            }
        }

    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
