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
 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    CommandEvent,
    BulkTransfersCallbackProcessedDmEvt,
    ProcessBulkTransfersCallbackCmdEvt,
    SDKOutboundBulkTransfersRequestProcessedDmEvt,
    BulkTransferResponse,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkBatchInternalState, BulkTransactionInternalState, IndividualTransferInternalState } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handleProcessBulkTransfersCallbackCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processBulkTransfersCallbackMessage = message as ProcessBulkTransfersCallbackCmdEvt;
    try {
        logger.info(`Got ProcessBulkTransfersCallbackCmdEvt: id=${processBulkTransfersCallbackMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processBulkTransfersCallbackMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkBatch = await bulkTransactionAgg.getBulkBatchEntityById(
            processBulkTransfersCallbackMessage.batchId,
        );
        const bulkTransfersResult = processBulkTransfersCallbackMessage.bulkTransfersResult as BulkTransferResponse;

        // If individual transfer result contains `lastError` the individual transfer state should be TRANSFER_FAILED.
        // bulkTransfersResult.currentState === 'ERROR_OCCURRED' necessitates erroring out all individual transfers in that bulk batch.
        if(bulkTransfersResult?.currentState === SDKOutboundTransferState.COMPLETED) {
            bulkBatch.setState(BulkBatchInternalState.TRANSFERS_COMPLETED);

            // Iterate through items in batch and update the individual states
            // TODO: We need to handle the case where the Quote was not successful!
            for await (const transferResult of bulkTransfersResult.individualTransferResults) {
                if(transferResult.transferId && !transferResult.lastError) {
                    const individualTransferId = bulkBatch.getReferenceIdForTransferId(transferResult.transferId);
                    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                    individualTransfer.setTransferState(IndividualTransferInternalState.TRANSFERS_SUCCESS);
                    individualTransfer.setTransferResponse({
                        ...transferResult,
                        completedTimestamp: bulkTransfersResult.completedTimestamp,
                    });
                    individualTransfer.setTransactionId(bulkBatch.id);
                    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
                } else {
                    const individualTransferId = bulkBatch.getReferenceIdForTransferId(transferResult.transferId);
                    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                    individualTransfer.setTransferState(IndividualTransferInternalState.TRANSFERS_FAILED);
                    individualTransfer.setTransferResponse(transferResult);
                    individualTransfer.setTransactionId(bulkBatch.id);
                    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
                }
            }
        // If the bulk transfer is in any other state, update the bulk batch and all individual transfers
        // to TRANSFERS_FAILED.
        } else {
            bulkBatch.setState(BulkBatchInternalState.TRANSFERS_FAILED);

            const individualTransferIds = Object.values(bulkBatch.transferIdReferenceIdMap);
            for await (const individualTransferId of individualTransferIds) {
                const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                individualTransfer.setTransferState(IndividualTransferInternalState.TRANSFERS_FAILED);
                individualTransfer.setTransactionId(bulkBatch.id);
                individualTransfer.setLastError(processBulkTransfersCallbackMessage.bulkTransfersErrorResult);
                await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
            }
        }

        bulkBatch.setBulkTransfersResponse(bulkTransfersResult);
        await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);

        const bulkTransfersCallbackProcessedDmEvt = new BulkTransfersCallbackProcessedDmEvt({
            bulkId: bulkTransactionAgg.bulkId,
            content: {
                batchId: bulkBatch.id,
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(bulkTransfersCallbackProcessedDmEvt);

        // Progressing to the next step
        // Check the status of the remaining items in the bulk
        const bulkTransfersTotalCount = await bulkTransactionAgg.getBulkTransfersTotalCount();
        let bulkTransfersSuccessCount;
        let bulkTransfersFailedCount;
        if(bulkTransfersResult?.currentState === SDKOutboundTransferState.COMPLETED) {
            bulkTransfersSuccessCount = await bulkTransactionAgg.incrementBulkTransfersSuccessCount();
            bulkTransfersFailedCount = await bulkTransactionAgg.getBulkTransfersFailedCount();
        } else {
            bulkTransfersFailedCount = await bulkTransactionAgg.incrementBulkTransfersFailedCount();
            bulkTransfersSuccessCount = await bulkTransactionAgg.getBulkTransfersSuccessCount();
        }

        if(bulkTransfersTotalCount === (bulkTransfersSuccessCount + bulkTransfersFailedCount)) {
            // Update global state "TRANSFERS_COMPLETED"
            await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.TRANSFERS_COMPLETED);

            // Send the domain message SDKOutboundBulkTransfersRequestProcessed
            const sdkOutboundBulkTransfersRequestProcessedDmEvt = new SDKOutboundBulkTransfersRequestProcessedDmEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await options.domainProducer.sendDomainEvent(sdkOutboundBulkTransfersRequestProcessedDmEvt);
            logger.info(`Sent domain event message ${SDKOutboundBulkTransfersRequestProcessedDmEvt.name}`);
        }

    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
