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
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
    PartyInfoRequestedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkTransactionInternalState } from '../..';
import { IndividualTransferInternalState } from '../..';

export async function handleProcessSDKOutboundBulkPartyInfoRequestCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkPartyInfoRequest = message as ProcessSDKOutboundBulkPartyInfoRequestCmdEvt;
    try {
        logger.info(`Got ProcessSDKOutboundBulkPartyInfoRequestCmdEvt: bulkId=${processSDKOutboundBulkPartyInfoRequest.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkPartyInfoRequest.getKey(),
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

            if(partyIdInfo.fspId) {
                individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
                await bulkTransactionAgg.setIndividualTransferById(individualTransferId, individualTransfer);
                continue;
            }

            const subId = partyIdInfo.partySubIdOrType ? `/${partyIdInfo.partySubIdOrType}` : '';
            const msg = new PartyInfoRequestedDmEvt({
                bulkId: bulkTx.id,
                content: {
                    transferId: individualTransfer.id,
                    request: {
                        partyIdType: partyIdInfo.partyIdType,
                        partyIdentifier: partyIdInfo.partyIdentifier,
                        partySubIdOrType: subId
                    }
                },
                timestamp: Date.now(),
                headers: [],
            });
            individualTransfer.setPartyRequest(msg.getContent());
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_PROCESSING);
            await options.domainProducer.sendDomainEvent(msg);
            await bulkTransactionAgg.setIndividualTransferById(individualTransferId, individualTransfer);
        }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    } catch (err: any) {
        logger.info(`Failed to create BulkTransactionAggregate. ${err.message}`);
    }
}