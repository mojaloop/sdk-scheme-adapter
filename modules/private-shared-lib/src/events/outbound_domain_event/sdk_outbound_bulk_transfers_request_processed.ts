'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';

export interface ISDKOutboundBulkTransfersRequestProcessedDmEvtData {
    bulkId: string;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

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
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            bulkId: message.getKey(),
        };
        return new SDKOutboundBulkTransfersRequestProcessedDmEvt(data);
    }
}
