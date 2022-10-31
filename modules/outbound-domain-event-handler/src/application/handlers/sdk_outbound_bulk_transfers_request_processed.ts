import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent,
    IPrepareSDKOutboundBulkResponseCmdEvtData,
    PrepareSDKOutboundBulkResponseCmdEvt,
    SDKOutboundBulkTransfersRequestProcessedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handleSDKOutboundBulkTransfersRequestProcessed(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    try {
        const sdkOutboundBulkTransfersRequestProcessedDmEvt
        = SDKOutboundBulkTransfersRequestProcessedDmEvt.CreateFromDomainEvent(message);

        const prepareSDKOutboundBulkResponseCmdEvtData: IPrepareSDKOutboundBulkResponseCmdEvtData = {
            bulkId: sdkOutboundBulkTransfersRequestProcessedDmEvt.getKey(),
            timestamp: Date.now(),
            headers: sdkOutboundBulkTransfersRequestProcessedDmEvt.getHeaders(),
        };

        const prepareSDKOutboundBulkResponseCmdEvt
            = new PrepareSDKOutboundBulkResponseCmdEvt(prepareSDKOutboundBulkResponseCmdEvtData);

        await options.commandProducer.sendCommandEvent(prepareSDKOutboundBulkResponseCmdEvt);

        logger.info(`Sent command event ${prepareSDKOutboundBulkResponseCmdEvt.getName()}`);
        logger.debug(prepareSDKOutboundBulkResponseCmdEvt);

    } catch (err) {
        logger.info(`Failed to send command event . ${(err as Error).message}`);
    }
}
