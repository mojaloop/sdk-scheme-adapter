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
    CommandEventMessage,
    ProcessSDKOutboundBulkPartyInfoRequestMessage,
    PartyInfoRequestedMessage,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkTransactionInternalState } from '../..';
import { IndividualTransferInternalState } from '../..';

export async function handleProcessSDKOutboundBulkPartyInfoRequestMessage(
    message: CommandEventMessage,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkPartyInfoRequestMessage = message as ProcessSDKOutboundBulkPartyInfoRequestMessage;
    try {
        logger.info(`Got ProcessSDKOutboundBulkPartyInfoRequestMessage: bulkId=${processSDKOutboundBulkPartyInfoRequestMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkPartyInfoRequestMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkTx = bulkTransactionAgg.getBulkTransaction();

        bulkTx.setTxState(BulkTransactionInternalState.DISCOVERY_PROCESSING);
        await bulkTransactionAgg.setTransaction(bulkTx);

        const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
        for await (const individualTransferId of allIndividualTransferIds) {
            const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);

            if(bulkTx.isSkipPartyLookupEnabled()) {
                if(individualTransfer.isPartyInfoExists) {
                    individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
                } else {
                    individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_FAILED);
                }
                await bulkTransactionAgg.setIndividualTransferById(individualTransferId, individualTransfer);
                continue;
            }
            const { partyIdInfo } = individualTransfer.request.to;
            const subId = partyIdInfo.partySubIdOrType ? `/${partyIdInfo.partySubIdOrType}` : '';
            const msg = new PartyInfoRequestedMessage({
                bulkId: bulkTx.id,
                transferId: individualTransfer.id,
                timestamp: Date.now(),
                headers: [],
                request: {
                    method: 'GET',
                    path: `/parties/${partyIdInfo.partyIdType}/${partyIdInfo.partyIdentifier}${subId}`,
                    headers: [],
                    body: '',
                },
            });
            individualTransfer.setPartyRequest(msg.getContent());
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_PROCESSING);
            await options.domainProducer.sendDomainMessage(msg);
            await bulkTransactionAgg.setIndividualTransferById(individualTransferId, individualTransfer);
        }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    } catch (err: any) {
        logger.info(`Failed to create BulkTransactionAggregate. ${err.message}`);
    }
}
