import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent,
    BulkTransfersCallbackReceivedDmEvt,
    ProcessBulkTransfersCallbackCmdEvt,
    IProcessBulkTransfersCallbackCmdEvtData,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handleBulkTransfersCallbackReceived(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const bulkTransfersCallbackReceivedMessage
        = BulkTransfersCallbackReceivedDmEvt.CreateFromDomainEvent(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessBulkTransfersCallbackCmdEvtData = {
            bulkId: bulkTransfersCallbackReceivedMessage.getKey(),
            content: {
                batchId: bulkTransfersCallbackReceivedMessage.batchId,
                bulkTransferId: bulkTransfersCallbackReceivedMessage.bulkTransferId,
                bulkTransfersResult: bulkTransfersCallbackReceivedMessage.bulkTransfersResult,
            },
            timestamp: Date.now(),
            headers: bulkTransfersCallbackReceivedMessage.getHeaders(),
        };

        const processBulkTransfersCallbackMessage
            = new ProcessBulkTransfersCallbackCmdEvt(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandEvent(processBulkTransfersCallbackMessage);

        logger.info(`Sent command event ${processBulkTransfersCallbackMessage.getName()}`);
        console.log(processBulkTransfersCallbackMessage);
    } catch (err) {
        logger.info(`Failed to send command event ${ProcessBulkTransfersCallbackCmdEvt.name}. ${(err as Error).message}`);
    }
}
