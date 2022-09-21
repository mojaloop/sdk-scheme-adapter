'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    BulkTransactionInternalState,
    CommandEvent,
    PrepareSDKOutboundBulkResponseCmdEvt,
    SDKOutboundBulkResponsePreparedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';

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

        const bulkResponse = bulkTransactionAgg.getBulkTransaction();
        const msg = new SDKOutboundBulkResponsePreparedDmEvt({
            bulkResponse,
            timestamp: Date.now(),
            headers: [],
        });
        await options.domainProducer.sendDomainEvent(msg);

        bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.RESPONSE_PROCESSING);
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
