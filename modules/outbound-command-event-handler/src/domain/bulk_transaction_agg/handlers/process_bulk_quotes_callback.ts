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

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { CommandEvent, BulkQuotesCallbackProcessedDmEvt, ProcessBulkQuotesCallbackCmdEvt, SDKOutboundBulkQuotesRequestProcessedDmEvt, SDKOutboundBulkAcceptQuoteRequestedDmEvt, CoreConnectorBulkAcceptQuoteRequestIndividualTransferResult } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkBatchInternalState, BulkTransactionInternalState, IndividualTransferInternalState } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handleProcessBulkQuotesCallbackCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processBulkQuotesCallbackMessage = message as ProcessBulkQuotesCallbackCmdEvt;
    try {
        logger.info(`Got ProcessBulkQuotesCallbackCmdEvt: id=${processBulkQuotesCallbackMessage.getKey()}`);
        let successCountAfterIncrement;
        let failedCountAfterIncrement;

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processBulkQuotesCallbackMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkBatch = await bulkTransactionAgg.getBulkBatchEntityById(
            processBulkQuotesCallbackMessage.batchId,
        );
        const bulkQuotesResult = processBulkQuotesCallbackMessage.bulkQuotesResult;

        // If individual quote result contains `lastError` the individual transfer state should be AGREEMENT_FAILED.
        // bulkQuotesResult.currentState === 'ERROR_OCCURRED' necessitates erroring out all individual transfers in that bulk batch.
        if(bulkQuotesResult.currentState &&
           bulkQuotesResult.currentState === 'COMPLETED') {
            bulkBatch.setState(BulkBatchInternalState.AGREEMENT_COMPLETED);
            successCountAfterIncrement = await bulkTransactionAgg.incrementBulkQuotesSuccessCount();

            // Iterate through items in batch and update the individual states
            for await (const quoteResult of bulkQuotesResult.individualQuoteResults) {
                if(quoteResult.quoteId && !quoteResult.lastError) {
                    const individualTransferId = bulkBatch.getReferenceIdForQuoteId(quoteResult.quoteId);
                    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                    individualTransfer.setTransferState(IndividualTransferInternalState.AGREEMENT_SUCCESS);
                    individualTransfer.setQuoteResponse(quoteResult);
                    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
                } else {
                    const individualTransferId = bulkBatch.getReferenceIdForQuoteId(quoteResult.quoteId);
                    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                    individualTransfer.setTransferState(IndividualTransferInternalState.AGREEMENT_FAILED);
                    individualTransfer.setQuoteResponse(quoteResult);
                    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
                }
            }
        // If the bulk quote is in any other state, update the bulk batch and all individual transfers
        // to AGREEMENT_FAILED.
        } else {
            bulkBatch.setState(BulkBatchInternalState.AGREEMENT_FAILED);
            failedCountAfterIncrement = await bulkTransactionAgg.incrementBulkQuotesFailedCount();

            const individualTransferIds = Object.values(bulkBatch.quoteIdReferenceIdMap);
            for await (const individualTransferId of individualTransferIds) {
                const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                individualTransfer.setTransferState(IndividualTransferInternalState.AGREEMENT_FAILED);
                await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
            }
        }
        bulkBatch.setBulkQuotesResponse(bulkQuotesResult);
        await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);

        const bulkQuotesCallbackProcessedDmEvt = new BulkQuotesCallbackProcessedDmEvt({
            bulkId: bulkTransactionAgg.bulkId,
            content: {
                batchId: bulkBatch.id,
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(bulkQuotesCallbackProcessedDmEvt);

        // Progressing to the next step
        // Check the status of the remaining items in the bulk
        const bulkQuotesTotalCount = await bulkTransactionAgg.getBulkQuotesTotalCount();
        const bulkQuotesSuccessCount = successCountAfterIncrement || await bulkTransactionAgg.getBulkQuotesSuccessCount();
        const bulkQuotesFailedCount = failedCountAfterIncrement || await bulkTransactionAgg.getBulkQuotesFailedCount();
        if(bulkQuotesTotalCount === (bulkQuotesSuccessCount + bulkQuotesFailedCount)) {
            // Update global state "AGREEMENT_COMPLETED"
            await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.AGREEMENT_COMPLETED);

            // Send the domain message SDKOutboundBulkQuotesRequestProcessed
            const sdkOutboundBulkQuotesRequestProcessedDmEvt = new SDKOutboundBulkQuotesRequestProcessedDmEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await options.domainProducer.sendDomainEvent(sdkOutboundBulkQuotesRequestProcessedDmEvt);
            logger.info(`Sent domain event message ${SDKOutboundBulkQuotesRequestProcessedDmEvt.name}`);

            // Progressing to the next step
            // Check configuration parameter autoAcceptQuote
            logger.info(`Checking for quote auto acceptance for bulk transaction ${bulkTransactionAgg.bulkId}`);
            const bulkTransaction = bulkTransactionAgg.getBulkTransaction();
            if(bulkTransaction.isAutoAcceptQuoteEnabled()) {
                // autoAcceptQuote is true
                logger.error(`AutoAcceptQuote === true is not implemented currently. Bulk transaction id is ${bulkTransactionAgg.bulkId}`);
                // TODO: Send domain event SDKOutboundBulkAutoAcceptQuoteRequested
                // TODO: This alternate path is not covered in the story #2802

            } else {
                // autoAcceptQuote is false
                // Send domain event SDKOutboundBulkAcceptQuoteRequested
                const individualTransferResults: CoreConnectorBulkAcceptQuoteRequestIndividualTransferResult[] = [];
                const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
                for await (const individualTransferId of allIndividualTransferIds) {
                    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
                    if(individualTransfer.quoteResponse) {
                        individualTransferResults.push({
                            homeTransactionId: individualTransfer.request.homeTransactionId,
                            transactionId: individualTransfer.id,
                            quoteResponse: individualTransfer.quoteResponse,
                        });
                    }
                }

                const sdkOutboundBulkAcceptQuoteRequestedDmEvt = new SDKOutboundBulkAcceptQuoteRequestedDmEvt({
                    bulkId: bulkTransactionAgg.bulkId,
                    bulkAcceptQuoteRequest: {
                        bulkHomeTransactionID: bulkTransactionAgg.getBulkTransaction().bulkHomeTransactionID,
                        bulkTransactionId: bulkTransactionAgg.bulkId,
                        individualTransferResults,
                    },
                    timestamp: Date.now(),
                    headers: [],
                });
                await options.domainProducer.sendDomainEvent(sdkOutboundBulkAcceptQuoteRequestedDmEvt);
                // Update global state AGREEMENT_ACCEPTANCE_PENDING
                await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.AGREEMENT_ACCEPTANCE_PENDING);
            }
        }

    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
