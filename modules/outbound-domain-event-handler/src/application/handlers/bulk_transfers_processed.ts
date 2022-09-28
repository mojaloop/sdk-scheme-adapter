import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handleBulkTransfersProcessed(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    try {
    } catch (err) {
        logger.info(`Failed to send command event . ${(err as Error).message}`);
    }
}
