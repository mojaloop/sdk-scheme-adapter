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
import { CommandEventMessage, ProcessSDKOutboundBulkPartyInfoRequestCompleteMessage } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { BulkTransactionInternalState } from '../..';


export async function handleProcessSDKOutboundBulkPartyInfoRequestCompleteMessage(
    processSDKOutboundBulkPartyInfoRequestCompleteMessage: ProcessSDKOutboundBulkPartyInfoRequestCompleteMessage,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    try {
        logger.info(`Got ProcessSDKOutboundBulkPartyInfoRequestCompleteMessage: bulkid=${processSDKOutboundBulkPartyInfoRequestCompleteMessage.getKey()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            processSDKOutboundBulkPartyInfoRequestCompleteMessage.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );

        const bulkTx = bulkTransactionAgg.getBulkTransaction();

        bulkTx.setTxState(BulkTransactionInternalState.DISCOVERY_COMPLETED);

        if(bulkTx.isAutoAcceptPartyEnabled()) {
            // TODO: construct and send SDKOutboundBulkAcceptPartyInfoRequested message to domain event handler
        }

        await bulkTransactionAgg.setTransaction(bulkTx);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    } catch (err: any) {
        logger.info(`Failed to create BulkTransactionAggregate. ${err.message}`);
    }
}
