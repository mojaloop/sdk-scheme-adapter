'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    BulkTransactionInternalState,
    CommandEvent,
    PrepareSDKOutboundBulkResponseSentCmdEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { BulkTransactionAgg } from '..';
import { ICommandEventHandlerOptions } from '@module-types';

export async function handlePrepareSDKOutboundBulkResponseSentCmdEvt(
    message: CommandEvent,
    options: ICommandEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const prepareSDKOutboundBulkResponseSent = message as PrepareSDKOutboundBulkResponseSentCmdEvt;
    try {
        // Create aggregate
        const bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
            prepareSDKOutboundBulkResponseSent.getKey(),
            options.bulkTransactionEntityRepo,
            logger,
        );
        logger.info(`Created BulkTransactionAggregate ${bulkTransactionAgg}`);

        bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.RESPONSE_SENT);
    } catch (err) {
        logger.error(`Failed to create BulkTransactionAggregate. ${(err as Error).message}`);
    }
}
