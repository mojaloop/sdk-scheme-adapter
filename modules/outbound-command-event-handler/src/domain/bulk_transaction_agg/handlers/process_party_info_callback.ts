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
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';

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
            processPartyInfoCallback.getBulkId(),
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info('XXXXXXXXXXXXXXXXXXX');

        logger.info(await bulkTransactionAgg.getAllIndividualTransferIds());
        const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(
            processPartyInfoCallback.getTransferId(),
        );
        const partyResult = processPartyInfoCallback.getPartyResult();
        logger.info(partyResult);
        if(partyResult.currentState && partyResult.currentState === SDKOutboundTransferState.COMPLETED) {
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
        } else {
            individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_FAILED);
        }
        individualTransfer.setPartyResponse(partyResult);

        const msg = new PartyInfoCallbackProcessedDmEvt({
            bulkId: processPartyInfoCallback.getKey(),
            content: {
                transferId: processPartyInfoCallback.getTransferId(),
            },
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(msg);

        await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer);
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
