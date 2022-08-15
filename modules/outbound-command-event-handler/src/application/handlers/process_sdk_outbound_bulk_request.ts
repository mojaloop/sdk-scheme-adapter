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
import { CommandEventMessage, ProcessSDKOutboundBulkRequestMessage, SDKOutboundBulkPartyInfoRequestedMessage } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '../../domain/bulk_transaction_agg';
import { ICommandEventHandlerOptions } from '../../types';

export async function handleProcessSDKOutboundBulkRequest(
    message: CommandEventMessage,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    // TODO: Duplicate check here?
    const processSDKOutboundBulkRequestMessage =
      ProcessSDKOutboundBulkRequestMessage.CreateFromCommandEventMessage(message);
    try {
        const sdkOutboundBulkRequestEntity = processSDKOutboundBulkRequestMessage.createSDKOutboundBulkRequestEntity();
        logger.info(`Got SDKOutboundBulkRequestEntity ${sdkOutboundBulkRequestEntity}`);

        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
            sdkOutboundBulkRequestEntity.request,
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info(`Created BulkTransactionAggregate ${bulkTransactionAgg}`);

        const msg = new SDKOutboundBulkPartyInfoRequestedMessage({
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
