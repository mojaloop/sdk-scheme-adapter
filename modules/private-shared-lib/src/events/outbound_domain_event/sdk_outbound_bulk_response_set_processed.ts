'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';

export type ISDKOutboundBulkResponseSentProcessedDmEvtData = {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class SDKOutboundBulkResponseSentProcessedDmEvt extends DomainEvent {
    constructor(data: ISDKOutboundBulkResponseSentProcessedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: SDKOutboundBulkResponseSentProcessedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkResponseSentProcessedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: ISDKOutboundBulkResponseSentProcessedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as ISDKOutboundBulkResponseSentProcessedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkResponseSentProcessedDmEvt(data);
    }
}
