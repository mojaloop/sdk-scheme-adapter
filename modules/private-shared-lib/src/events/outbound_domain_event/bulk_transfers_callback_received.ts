'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { BulkTransferErrorResponse, BulkTransferResponse } from '@module-types';

export type IBulkTransfersCallbackReceivedDmEvtData = {
    bulkId: string;
    content: {
        batchId: string;
        bulkTransfersResult?: BulkTransferResponse;
        bulkTransfersErrorResult?: BulkTransferErrorResponse;
    },
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};

export class BulkTransfersCallbackReceivedDmEvt extends DomainEvent {
    constructor(data: IBulkTransfersCallbackReceivedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: data.content,
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

    get batchId(): string {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.batchId;
    }

    get bulkTransferId(): string | undefined {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.bulkTransfersResult?.bulkTransferId;
    }

    get bulkTransfersResult(): BulkTransferResponse | undefined {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.bulkTransfersResult;
    }

    get bulkTransfersErrorResult(): BulkTransferErrorResponse | undefined {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.bulkTransfersErrorResult;
    }
}
