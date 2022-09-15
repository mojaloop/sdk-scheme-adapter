'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export type ISDKOutboundBulkTransfersRequestProcessedDmEvtData = {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class SDKOutboundBulkTransfersRequestProcessedDmEvt extends DomainEvent {
    constructor(data: ISDKOutboundBulkTransfersRequestProcessedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: SDKOutboundBulkTransfersRequestProcessedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkTransfersRequestProcessedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: ISDKOutboundBulkTransfersRequestProcessedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as ISDKOutboundBulkTransfersRequestProcessedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkTransfersRequestProcessedDmEvt(data);
    }
}
