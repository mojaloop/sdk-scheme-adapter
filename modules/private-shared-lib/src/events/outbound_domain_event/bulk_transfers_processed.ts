'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';

export type IBulkTransfersProcessedDmEvtData = {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class BulkTransfersProcessedDmEvt extends DomainEvent {
    constructor(data: IBulkTransfersProcessedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: BulkTransfersProcessedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): BulkTransfersProcessedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IBulkTransfersProcessedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IBulkTransfersProcessedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new BulkTransfersProcessedDmEvt(data);
    }
}
