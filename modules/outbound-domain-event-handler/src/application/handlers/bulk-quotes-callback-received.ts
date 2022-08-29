import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEventMessage, IProcessBulkQuotesCallbackMessageData, ProcessBulkQuotesCallbackMessage,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';
import { BulkQuotesCallbackReceivedMessage } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handleBulkQuotesCallbackReceived(
    message: DomainEventMessage,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const bulkQuotesCallbackReceivedMessage
        = BulkQuotesCallbackReceivedMessage.CreateFromDomainEventMessage(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessBulkQuotesCallbackMessageData = {
            key: bulkQuotesCallbackReceivedMessage.getKey(),
            content: {
                batchId: bulkQuotesCallbackReceivedMessage.batchId,
                bulkQuoteId: bulkQuotesCallbackReceivedMessage.bulkQuoteId,
                bulkQuotesResult: bulkQuotesCallbackReceivedMessage.bulkQuotesResult
            },
            timestamp: Date.now(),
            headers: bulkQuotesCallbackReceivedMessage.getHeaders(),
        };

        const processBulkQuotesCallbackMessage
            = new ProcessBulkQuotesCallbackMessage(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandMessage(processBulkQuotesCallbackMessage);

        logger.info(`Sent command event ${processBulkQuotesCallbackMessage.getName()}`);
        console.log(processBulkQuotesCallbackMessage);
    } catch (err: any) {
        logger.info(`Failed to send command event ProcessBulkQuotesCallbackMessage. ${err.message}`);
    }
}
