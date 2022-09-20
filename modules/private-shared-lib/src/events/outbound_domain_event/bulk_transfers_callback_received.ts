'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export type IBulkTransfersCallbackReceivedDmEvtData = {
    bulkId: string;
    content: {
        batchId: string;
        bulkTransferId: string;
        bulkTransfersResult: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferResponse
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

    get bulkTransferId(): string {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.bulkTransferId;
    }

    get bulkTransfersResult(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferResponse {
        const content = this.getContent() as IBulkTransfersCallbackReceivedDmEvtData['content'];
        return content.bulkTransfersResult;
    }
}
