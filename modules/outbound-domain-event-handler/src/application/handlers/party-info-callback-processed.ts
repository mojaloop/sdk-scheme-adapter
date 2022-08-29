import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEventMessage,
    IProcessSDKOutboundBulkPartyInfoRequestCompleteMessageData,
    ProcessSDKOutboundBulkPartyInfoRequestCompleteMessage,
    PartyInfoCallbackProcessedMessage,
    IBulkTransactionEntityReadOnlyRepo,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handlePartyInfoCallbackProcessed(
    message: DomainEventMessage,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const partyInfoCallbackProcessedMessage
        = PartyInfoCallbackProcessedMessage.CreateFromCommandEventMessage(message);

    const totalLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupTotalCount(partyInfoCallbackProcessedMessage.getBulkId());
    const totalSuccessLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupSuccessCount(partyInfoCallbackProcessedMessage.getBulkId());
    const totalFailureLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupFailureCount(partyInfoCallbackProcessedMessage.getBulkId());

    if(totalLookups != (totalSuccessLookups + totalFailureLookups))
        return;

    try {
        const processSDKOutboundBulkPartyInfoRequestCompleteMessageData :
        IProcessSDKOutboundBulkPartyInfoRequestCompleteMessageData = {
            bulkId: partyInfoCallbackProcessedMessage.getBulkId(),
            timestamp: Date.now(),
            headers: partyInfoCallbackProcessedMessage.getHeaders(),
        };

        const processSDKOutboundBulkPartyInfoRequestCompleteMessage
            = new ProcessSDKOutboundBulkPartyInfoRequestCompleteMessage(
                processSDKOutboundBulkPartyInfoRequestCompleteMessageData,
            );

        await options.commandProducer.sendCommandMessage(processSDKOutboundBulkPartyInfoRequestCompleteMessage);

        logger.info(`Sent command event ${processSDKOutboundBulkPartyInfoRequestCompleteMessage.getName()}`);
        console.log(processSDKOutboundBulkPartyInfoRequestCompleteMessage);
    } catch (err: any) {
        logger.info(`Failed to create SDKOutboundBulkRequestEntity. ${err.message}`);
    }
}
