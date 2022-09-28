'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export type IBulkTransfersCallbackProcessedDmEvtData = {
    bulkId: string;
    content: {
        batchId: string;
    };
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class BulkTransfersCallbackProcessedDmEvt extends DomainEvent {
    constructor(data: IBulkTransfersCallbackProcessedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: data.content,
            name: BulkTransfersCallbackProcessedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): BulkTransfersCallbackProcessedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IBulkTransfersCallbackProcessedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IBulkTransfersCallbackProcessedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new BulkTransfersCallbackProcessedDmEvt(data);
    }

    get batchId(): string {
        const content = this.getContent() as IBulkTransfersCallbackProcessedDmEvtData['content'];
        return content.batchId;
    }
}
