/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>
 * Infitx
 - Kevin Leyow <kevin.leyow@infitx.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    BulkTransactionInternalState,
    CommandEvent,
    PrepareSDKOutboundBulkResponseCmdEvt,
    SDKOutboundBulkResponsePreparedDmEvt,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

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
        const individualTransferResults = await Promise.all(allIndividualTransferIds.map(async id => {
            const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(id);
            return individualTransfer.toIndividualTransferResult();
        }));

        const bulkTransactionResponse: SDKSchemeAdapter.V2_1_0.Backend.Types.bulkTransactionResponse = {
            bulkHomeTransactionID: bulkTransaction.bulkHomeTransactionID,
            bulkTransactionId: bulkTransaction.id,
            currentState: bulkTransaction.state == BulkTransactionInternalState.TRANSFERS_COMPLETED ? SDKOutboundTransferState.COMPLETED : SDKOutboundTransferState.ERROR_OCCURRED,
            options: bulkTransaction.options,
            individualTransferResults,
        };
        const msg = new SDKOutboundBulkResponsePreparedDmEvt({
            bulkId: bulkTransaction.id,
            bulkTransactionResponse,
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(msg);

        await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.RESPONSE_PROCESSING);
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
