'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface IPartyInfoCallbackReceivedMessageData {
    key: string;
    partyResult: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class PartyInfoCallbackReceivedMessage extends DomainEvent {
    constructor(data: IPartyInfoCallbackReceivedMessageData) {
        super({
            key: data.key,
            content: data.partyResult,
            timestamp: data.timestamp,
            headers: data.headers,
            name: PartyInfoCallbackReceivedMessage.name,
        });
    }

    getBulkId() {
        return this.getKey().split('_')[0];
    }

    getTransferId() {
        return this.getKey().split('_')[1];
    }

    getPartyResult(): SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse {
        return this.getContent() as SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse;
    }

    static CreateFromDomainEvent(message: DomainEvent): PartyInfoCallbackReceivedMessage {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IPartyInfoCallbackReceivedMessageData = {
            key: message.getKey(),
            partyResult: message.getContent() as SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new PartyInfoCallbackReceivedMessage(data);
    }
}
