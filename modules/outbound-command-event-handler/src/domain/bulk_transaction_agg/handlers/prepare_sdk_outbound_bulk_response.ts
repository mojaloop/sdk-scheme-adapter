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
    BulkTransactionInternalState,
    CommandEvent,
    IndividualTransferInternalState,
    PrepareSDKOutboundBulkResponseCmdEvt,
    SDKOutboundBulkResponsePreparedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
import { Enum as CentralServicedSharedEnum } from '@mojaloop/central-services-shared';

export async function handlePrepareSDKOutboundBulkResponseCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const prepareSDKOutboundBulkResponse = message as PrepareSDKOutboundBulkResponseCmdEvt;
    try {
        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            prepareSDKOutboundBulkResponse.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info(`Created BulkTransactionAggregate ${bulkTransactionAgg}`);

        const bulkTransaction = bulkTransactionAgg.getBulkTransaction();
        const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
        const individualTransferResults = [];
        for await (const individualTransferId of allIndividualTransferIds) {
            const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);
            const individualTransferRequest = individualTransfer.request;
            const individualTransferResponse = individualTransfer.transferResponse;

            // TODO: Should we infer the FSPIOP-transferState for the individualTransfer based on the SDK-IndividualTransferInternalState? See comments below in the Fulfil mapping.
            // eslint-disable-next-line max-len
            const transferState = (individualTransfer.transferState === IndividualTransferInternalState.TRANSFERS_SUCCESS) ? CentralServicedSharedEnum.Transfers.TransferState.COMMITTED : CentralServicedSharedEnum.Transfers.TransferState.ABORTED;
            
            // TODO: Investigate how many individual transfers this message can handle.
            // eslint-disable-next-line max-len
            const individualTransferResult: SDKSchemeAdapter.V2_0_0.Inbound.Types.bulkTransactionIndividualTransferResult = {
                transferId: individualTransferResponse?.transferId,
                homeTransactionId: individualTransferRequest.homeTransactionId,
                transactionId: individualTransfer.transactionId!, // TODO: why is this failing lint?
                quoteId: individualTransfer.quoteResponse?.quoteId,
                to: individualTransfer.partyResponse.party,
                amountType: individualTransferRequest.amountType,
                amount: individualTransferRequest.amount,
                currency: individualTransferRequest.currency,
                quoteResponse: individualTransfer.quoteResponse as SDKSchemeAdapter.V2_0_0.Inbound.Types.bulkTransactionIndividualTransferResult['quoteResponse'],
                fulfil: {
                    ...individualTransferResponse as SDKSchemeAdapter.V2_0_0.Inbound.Types.bulkTransactionIndividualTransferResult['fulfil'],
                    transferState, // TODO: This should be addressed as the BulkTransfers SDK model is missing the individualTransfers.transferState. Future story to address this.
                    // completedTimestamp?: string; // TODO: This also should be mapped from the BulkTransfers SDK model, but is currently missing. Future story (possible bug) to address this.
                },
                quoteExtensions: individualTransfer.quoteResponse?.extensionList,
                transferExtensions: individualTransferResponse?.extensionList,
                // eslint-disable-next-line max-len
                lastError: individualTransferResponse?.lastError || individualTransfer.quoteResponse?.lastError || undefined,
            };
            individualTransferResults.push(individualTransferResult);
        }

        const bulkTransactionResponse: SDKSchemeAdapter.V2_0_0.Inbound.Types.bulkTransactionResponse = {
            bulkHomeTransactionID: bulkTransaction.bulkHomeTransactionID,
            bulkTransactionId: bulkTransaction.id,
            currentState: bulkTransaction.state == BulkTransactionInternalState.TRANSFERS_COMPLETED ? 'COMPLETED' : 'ERROR_OCCURRED',
            options: bulkTransaction.options,
            individualTransferResults: individualTransferResults,
        };
        const msg = new SDKOutboundBulkResponsePreparedDmEvt({
            bulkId: bulkTransaction.id,
            bulkTransactionResponse,
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(msg);

        bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.RESPONSE_PROCESSING);
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
