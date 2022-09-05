import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent,
    IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData,
    ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt,
    PartyInfoCallbackProcessedDmEvt,
    IBulkTransactionEntityReadOnlyRepo,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handlePartyInfoCallbackProcessed(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    const partyInfoCallbackProcessedDmtEvt
        = PartyInfoCallbackProcessedDmEvt.CreateFromCommandEvent(message);

    const totalLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupTotalCount(partyInfoCallbackProcessedDmtEvt.getBulkId());
    const totalSuccessLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupSuccessCount(partyInfoCallbackProcessedDmtEvt.getBulkId()) | 0;
    const totalFailedLookups = await (
      <IBulkTransactionEntityReadOnlyRepo> options.bulkTransactionEntityRepo
    ).getPartyLookupFailedCount(partyInfoCallbackProcessedDmtEvt.getBulkId()) | 0;

    if(totalLookups != (totalSuccessLookups + totalFailedLookups))
        return;

    try {
        const processSDKOutboundBulkPartyInfoRequestCompleteData :
        IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
            bulkId: partyInfoCallbackProcessedDmtEvt.getBulkId(),
            timestamp: Date.now(),
            headers: partyInfoCallbackProcessedDmtEvt.getHeaders(),
        };

        const processSDKOutboundBulkPartyInfoRequestCompleteMessage
            = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(
                processSDKOutboundBulkPartyInfoRequestCompleteData,
            );

        await options.commandProducer.sendCommandMessage(processSDKOutboundBulkPartyInfoRequestCompleteMessage);

        logger.info(`Sent command event ${processSDKOutboundBulkPartyInfoRequestCompleteMessage.getName()}`);
        console.log(processSDKOutboundBulkPartyInfoRequestCompleteMessage);
    } catch (err: any) {
        logger.info(`Failed to create SDKOutboundBulkRequestEntity. ${err.message}`);
    }
}
