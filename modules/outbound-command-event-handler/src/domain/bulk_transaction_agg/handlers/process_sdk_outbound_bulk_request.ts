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
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    CommandEvent,
    PrepareSDKOutboundBulkResponseCmdEvt,
    ProcessSDKOutboundBulkRequestCmdEvt,
    SDKOutboundBulkPartyInfoRequestedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';
import { handlePrepareSDKOutboundBulkResponseCmdEvt } from './prepare_sdk_outbound_bulk_response';

export async function handleProcessSDKOutboundBulkRequestCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const processSDKOutboundBulkRequest = message as ProcessSDKOutboundBulkRequestCmdEvt;
    try {
        logger.info(`Got Bulk Request ${processSDKOutboundBulkRequest.getBulkRequest()}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
            processSDKOutboundBulkRequest.getBulkRequest(),
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info(`Created BulkTransactionAggregate ${bulkTransactionAgg}`);

        const totalCount = await bulkTransactionAgg.getTotalCount();
        const failedCount = await bulkTransactionAgg.getFailedCount();

        if(totalCount === failedCount) {
            const msg = new PrepareSDKOutboundBulkResponseCmdEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await handlePrepareSDKOutboundBulkResponseCmdEvt(msg, options, logger);
        } else {
            const msg = new SDKOutboundBulkPartyInfoRequestedDmEvt({
                bulkId: bulkTransactionAgg.bulkId,
                timestamp: Date.now(),
                headers: [],
            });
            await options.domainProducer.sendDomainEvent(msg);
        }

    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
