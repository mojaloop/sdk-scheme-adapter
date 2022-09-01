'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface IPartyInfoCallbackReceivedDmEvtData {
    bulkId: string;
    content: {
        transferId: string;
        partyResult: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse;
    };
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class PartyInfoCallbackReceivedDmEvt extends DomainEvent {
    constructor(data: IPartyInfoCallbackReceivedDmEvtData) {
        super({
            key: data.bulkId,
            content: data.content,
            timestamp: data.timestamp,
            headers: data.headers,
            name: PartyInfoCallbackReceivedDmEvt.name,
        });
    }

    getBulkId(): string {
        return this.getKey();
    }

    getTransferId(): string {
        return (this.getContent() as IPartyInfoCallbackReceivedDmEvtData['content']).transferId;
    }

    getPartyResult(): SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse {
        return (this.getContent() as IPartyInfoCallbackReceivedDmEvtData['content']).partyResult;
    }

    static CreateFromDomainEvent(message: DomainEvent): PartyInfoCallbackReceivedDmEvt {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IPartyInfoCallbackReceivedDmEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IPartyInfoCallbackReceivedDmEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new PartyInfoCallbackReceivedDmEvt(data);
    }
}
