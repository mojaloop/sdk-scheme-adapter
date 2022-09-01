import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent, IProcessBulkQuotesCallbackCmdEvtData, ProcessBulkQuotesCallbackCmdEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';
import { BulkQuotesCallbackReceivedDmEvt } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handleBulkQuotesCallbackReceived(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const bulkQuotesCallbackReceivedMessage
        = BulkQuotesCallbackReceivedDmEvt.CreateFromDomainEvent(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessBulkQuotesCallbackCmdEvtData = {
            bulkId: bulkQuotesCallbackReceivedMessage.getKey(),
            content: {
                batchId: bulkQuotesCallbackReceivedMessage.batchId,
                bulkQuoteId: bulkQuotesCallbackReceivedMessage.bulkQuoteId,
                bulkQuotesResult: bulkQuotesCallbackReceivedMessage.bulkQuotesResult
            },
            timestamp: Date.now(),
            headers: bulkQuotesCallbackReceivedMessage.getHeaders(),
        };

        const processBulkQuotesCallbackMessage
            = new ProcessBulkQuotesCallbackCmdEvt(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandEvent(processBulkQuotesCallbackMessage);

        logger.info(`Sent command event ${processBulkQuotesCallbackMessage.getName()}`);
        console.log(processBulkQuotesCallbackMessage);
    } catch (err) {
        logger.info(`Failed to send command event ProcessBulkQuotesCallbackCmdEvt. ${(err as Error).message}`);
    }
}
