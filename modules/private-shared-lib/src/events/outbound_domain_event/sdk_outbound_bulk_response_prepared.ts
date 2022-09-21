'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { BulkTransactionState } from '@module-domain';

export interface ISDKOutboundBulkResponsePreparedDmEvtData {
    bulkResponse: BulkTransactionState;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class SDKOutboundBulkResponsePreparedDmEvt extends DomainEvent {
    constructor(data: ISDKOutboundBulkResponsePreparedDmEvtData) {
        super({
            key: data.bulkResponse.bulkTransactionId,
            content: data.bulkResponse,
            timestamp: data.timestamp,
            headers: data.headers,
            name: SDKOutboundBulkResponsePreparedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkResponsePreparedDmEvt {
        // Prepare Data
        const data = {
            bulkResponse: message.getContent() as BulkTransactionState,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkResponsePreparedDmEvt(data);
    }

    getBulkResponse(): BulkTransactionState {
        return this.getContent() as BulkTransactionState;
    }
}
