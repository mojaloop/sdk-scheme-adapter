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
import { CommandEventMessage, ProcessSDKOutboundBulkAcceptPartyInfoMessage, SDKOutboundBulkAcceptPartyInfoProcessedMessage } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkTransactionInternalState, IndividualTransferInternalState } from '../../../domain';

export async function handleProcessSDKOutboundBulkAcceptPartyInfoMessage(
    message: CommandEventMessage,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkAcceptPartyInfoMessage = message as ProcessSDKOutboundBulkAcceptPartyInfoMessage;
    // TODO: Add if confidtion here to check autoAcceptParty parameter and alternate flow
    try {
        logger.info(`Got ProcessSDKOutboundBulkAcceptPartyInfoMessage for ID ${processSDKOutboundBulkAcceptPartyInfoMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkAcceptPartyInfoMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info(`Created BulkTransactionAggregate ${bulkTransactionAgg}`);

        // Update the individual state: DISCOVERY_ACCEPTED / DISCOVERY_REJECTED
        const bulkTx = bulkTransactionAgg.getBulkTransaction();

        const allIndividualTransfersFromMessage = processSDKOutboundBulkAcceptPartyInfoMessage.getBulkTransactionContinuationAcceptParty().individualTransfers;
        for await (const individualTransferFromMessage of allIndividualTransfersFromMessage) {
            let individualTransfer
            try {
                // TODO: Confirm the field name transactionId in the individualTransfer from the message
                individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferFromMessage.transactionId);
            } catch(err1) {
                logger.warn(`Can not find the individual transfer with id ${individualTransferFromMessage.transactionId} in bulk transaction`);
                continue;
            }

            individualTransfer.setAcceptParty(individualTransferFromMessage.acceptParty)
            if (individualTransferFromMessage.acceptParty) {
                individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_ACCEPTED);
            } else {
                individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_REJECTED);
            }
            await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
        }

        // Update global state "DISCOVERY_ACCEPTANCE_COMPLETED"
        bulkTx.setTxState(BulkTransactionInternalState.DISCOVERY_ACCEPTANCE_COMPLETED);
        await bulkTransactionAgg.setTransaction(bulkTx);

        const msg = new SDKOutboundBulkAcceptPartyInfoProcessedMessage({
            bulkId: bulkTransactionAgg.bulkId,
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainMessage(msg);

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    } catch (err: any) {
        logger.info(`Failed to create BulkTransactionAggregate. ${err.message}`);
    }
}
