import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent, IProcessPartyInfoCallbackCmdEvtData, ProcessPartyInfoCallbackCmdEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';
import { PartyInfoCallbackReceivedDmEvt } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export async function handlePartyInfoCallbackReceived(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const partyInfoCallbackReceivedMessage
        = PartyInfoCallbackReceivedDmEvt.CreateFromDomainEvent(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
            key: partyInfoCallbackReceivedMessage.getKey(),
            partyResult: partyInfoCallbackReceivedMessage.getPartyResult(),
            timestamp: Date.now(),
            headers: partyInfoCallbackReceivedMessage.getHeaders(),
        };

        const processPartyInfoCallbackMessage
            = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandMessage(processPartyInfoCallbackMessage);

        logger.info(`Sent command event ${processPartyInfoCallbackMessage.getName()}`);
        console.log(processPartyInfoCallbackMessage);
    } catch (err: any) {
        logger.info(`Failed to create SDKOutboundBulkRequestEntity. ${err.message}`);
    }
}
