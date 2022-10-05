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
    const partyInfoCallbackReceived
        = PartyInfoCallbackReceivedDmEvt.CreateFromDomainEvent(message);
    try {
        const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
            bulkId: partyInfoCallbackReceived.getKey(),
            content: {
                transferId: partyInfoCallbackReceived.transferId,
                partyResult: partyInfoCallbackReceived.partyResult,
                partyErrorResult: partyInfoCallbackReceived.partyErrorResult,
            },
            timestamp: Date.now(),
            headers: partyInfoCallbackReceived.getHeaders(),
        };

        const processPartyInfoCallbackMessage
            = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);

        await options.commandProducer.sendCommandEvent(processPartyInfoCallbackMessage);

        logger.info(`Sent command event ${processPartyInfoCallbackMessage.getName()}`);
    } catch (err) {
        logger.info(`Failed to create SDKOutboundBulkRequestEntity. ${(err as Error).message}`);
    }
}
