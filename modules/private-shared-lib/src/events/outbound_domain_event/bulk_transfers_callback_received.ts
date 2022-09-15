'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export type IBulkTransfersCallbackReceivedDmEvtData = {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class BulkTransfersCallbackReceivedDmEvt extends DomainEvent {
    constructor(data: IBulkTransfersCallbackReceivedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: BulkTransfersCallbackReceivedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): BulkTransfersCallbackReceivedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IBulkTransfersCallbackReceivedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new BulkTransfersCallbackReceivedDmEvt(data);
    }
}
