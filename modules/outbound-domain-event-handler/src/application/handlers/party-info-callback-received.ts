import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEventMessage, IProcessPartyInfoCallbackMessageData, ProcessPartyInfoCallbackMessage,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';
import { PartyInfoCallbackReceivedMessage } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handlePartyInfoCallbackReceived(
    message: DomainEventMessage,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const partyInfoCallbackReceivedMessage
        = PartyInfoCallbackReceivedMessage.CreateFromDomainEventMessage(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackMessageData = {
            key: partyInfoCallbackReceivedMessage.getKey(),
            partyResult: partyInfoCallbackReceivedMessage.getPartyResult(),
            timestamp: Date.now(),
            headers: partyInfoCallbackReceivedMessage.getHeaders(),
        };

        const processPartyInfoCallbackMessage
            = new ProcessPartyInfoCallbackMessage(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandMessage(processPartyInfoCallbackMessage);

        logger.info(`Sent command event ${processPartyInfoCallbackMessage.getName()}`);
        console.log(processPartyInfoCallbackMessage);
    } catch (err: any) {
        logger.info(`Failed to create SDKOutboundBulkRequestEntity. ${err.message}`);
    }
}
