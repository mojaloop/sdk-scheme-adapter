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
import {
    CommandEvent,
    IndividualTransferInternalState,
    ProcessPartyInfoCallbackCmdEvt,
    PartyInfoCallbackProcessedDmEvt,
    SDKOutboundTransferState,
    BulkTransactionInternalState,
    SDKOutboundBulkPartyInfoRequestProcessedDmEvt,
    SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt,
    SDKOutboundBulkAcceptPartyInfoRequestedDmEvt, PrepareSDKOutboundBulkResponseCmdEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { handlePrepareSDKOutboundBulkResponseCmdEvt } from './prepare_sdk_outbound_bulk_response';

export async function handleProcessPartyInfoCallbackCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processPartyInfoCallback = message as ProcessPartyInfoCallbackCmdEvt;
    try {
        logger.info(`Got ProcessPartyInfoCallbackCmdEvt: id=${processPartyInfoCallback.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processPartyInfoCallback.bulkId,
            options.bulkTransactionEntityRepo,
            logger,
        );

        const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(
            processPartyInfoCallback.transferId,
        );
        if(processPartyInfoCallback.partyResult?.currentState === SDKOutboundTransferState.COMPLETED) {
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
            individualTransfer.setPartyResponse(processPartyInfoCallback.partyResult);
        } else {
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_FAILED);
            individualTransfer.setLastError(processPartyInfoCallback.partyErrorResult);
        }
        await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);

        const msg = new PartyInfoCallbackProcessedDmEvt({
            bulkId: processPartyInfoCallback.getKey(),
            content: {
                transferId: processPartyInfoCallback.transferId,
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(msg);

        const totalCount = await bulkTransactionAgg.getTotalCount();
        const failedCount = await bulkTransactionAgg.getFailedCount();

        if(totalCount === failedCount) {
            const prepareSDKOutboundBulkResponseCmdEvt = new PrepareSDKOutboundBulkResponseCmdEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await handlePrepareSDKOutboundBulkResponseCmdEvt(prepareSDKOutboundBulkResponseCmdEvt, options, logger);
            return;
        }

        // Progressing to the next step
        // Check the status of the remaining party lookups
        const partyLookupTotalCount = await bulkTransactionAgg.getPartyLookupTotalCount();
        let partyLookupSuccessCount;
        let partyLookupFailedCount;
        if(processPartyInfoCallback.partyResult?.currentState === SDKOutboundTransferState.COMPLETED) {
            partyLookupSuccessCount = await bulkTransactionAgg.incrementPartyLookupSuccessCount();
            partyLookupFailedCount = await bulkTransactionAgg.getPartyLookupFailedCount();
        } else {
            partyLookupFailedCount = await bulkTransactionAgg.incrementPartyLookupFailedCount();
            await bulkTransactionAgg.incrementFailedCount();
            partyLookupSuccessCount = await bulkTransactionAgg.getPartyLookupSuccessCount();
        }
        
        if(partyLookupTotalCount === (partyLookupSuccessCount + partyLookupFailedCount)) {
            // Update global state "DISCOVERY_COMPLETED"
            await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.DISCOVERY_COMPLETED);

            // Send the domain message SDKOutboundBulkPartyInfoRequestProcessedDmEvt
            const sdkOutboundBulkPartyInfoRequestProcessedDmEvt = new SDKOutboundBulkPartyInfoRequestProcessedDmEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await options.domainProducer.sendDomainEvent(sdkOutboundBulkPartyInfoRequestProcessedDmEvt);
            logger.info(`Sent domain event message ${SDKOutboundBulkPartyInfoRequestProcessedDmEvt.name}`);

            // Progressing to the next step
            // Check configuration parameter isAutoAcceptPartyEnabled
            const bulkTx = bulkTransactionAgg.getBulkTransaction();
            if(bulkTx.isAutoAcceptPartyEnabled()) {
                const autoAcceptPartyMsg = new SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt({
                    bulkId: bulkTx.id,
                    timestamp: Date.now(),
                    headers: [],
                });
                await options.domainProducer.sendDomainEvent(autoAcceptPartyMsg);
            } else {
                const individualTransferResults = [];
                const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
                for await (const individualTransferId of allIndividualTransferIds) {
                    const individualTransferData = await bulkTransactionAgg
                        .getIndividualTransferById(individualTransferId);

                    // Individual transfers where `partyResult.currentState` does
                    // not match SDKOutboundTransferState.COMPLETED will have no `partyResponse`
                    // set. `transactionId` and `homeTransaction` still need to be set.
                    individualTransferResults.push({
                        homeTransactionId: individualTransferData.request.homeTransactionId,
                        transactionId: individualTransferData.id,
                        to: individualTransferData.partyResponse?.party,
                        lastError: individualTransferData.partyResponse?.errorInformation && {
                            mojaloopError: individualTransferData.partyResponse?.errorInformation,
                        },
                    });
                }
                const sdkOutboundBulkAcceptPartyInfoRequestedDmEvt = new SDKOutboundBulkAcceptPartyInfoRequestedDmEvt({
                    bulkId: bulkTransactionAgg.bulkId,
                    request: {
                        bulkHomeTransactionID: bulkTx.bulkHomeTransactionID,
                        bulkTransactionId: bulkTransactionAgg.bulkId,
                        individualTransferResults,
                    },
                    timestamp: Date.now(),
                    headers: [],
                });
                await options.domainProducer.sendDomainEvent(sdkOutboundBulkAcceptPartyInfoRequestedDmEvt);
                logger.info(`Sent domain event message ${SDKOutboundBulkAcceptPartyInfoRequestedDmEvt.name}`);

                bulkTx.setTxState(BulkTransactionInternalState.DISCOVERY_ACCEPTANCE_PENDING);
            }
            await bulkTransactionAgg.setTransaction(bulkTx);
        }
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
