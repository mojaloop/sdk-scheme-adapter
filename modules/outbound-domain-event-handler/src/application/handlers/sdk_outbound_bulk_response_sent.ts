import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    DomainEvent,
    IProcessSDKOutboundBulkResponseSentCmdEvtData,
    ProcessSDKOutboundBulkResponseSentCmdEvt,
    SDKOutboundBulkResponseSentDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../../types';

export async function handleSDKOutboundBulkResponseSent(
    message: DomainEvent,
    options: IDomainEventHandlerOptions,
    logger: ILogger,
): Promise<void> {
    try {
        const sdkOutboundBulkResponseSentDmEvt
        = SDKOutboundBulkResponseSentDmEvt.CreateFromDomainEvent(message);

        const processSDKOutboundBulkResponseSentCmdEvtData: IProcessSDKOutboundBulkResponseSentCmdEvtData = {
            bulkId: sdkOutboundBulkResponseSentDmEvt.getKey(),
            content: null,
            timestamp: Date.now(),
            headers: sdkOutboundBulkResponseSentDmEvt.getHeaders(),
        };

        const processSDKOutboundBulkResponseSentCmdEvt
            = new ProcessSDKOutboundBulkResponseSentCmdEvt(processSDKOutboundBulkResponseSentCmdEvtData);

        await options.commandProducer.sendCommandEvent(processSDKOutboundBulkResponseSentCmdEvt);

        logger.info(`Sent command event ${processSDKOutboundBulkResponseSentCmdEvt.getName()}`);
        logger.debug(processSDKOutboundBulkResponseSentCmdEvt);

    } catch (err) {
        logger.info(`Failed to send command event . ${(err as Error).message}`);
    }
}
