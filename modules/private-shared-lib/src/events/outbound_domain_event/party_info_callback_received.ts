'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';


export interface IPartyInfoCallbackReceivedDmEvtData {
    key: string;
    partyResult: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class PartyInfoCallbackReceivedDmEvt extends DomainEvent {
    constructor(data: IPartyInfoCallbackReceivedDmEvtData) {
        super({
            key: data.key,
            content: data.partyResult,
            timestamp: data.timestamp,
            headers: data.headers,
            name: PartyInfoCallbackReceivedDmEvt.name,
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

    static CreateFromDomainEvent(message: DomainEvent): PartyInfoCallbackReceivedDmEvt {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IPartyInfoCallbackReceivedDmEvtData = {
            key: message.getKey(),
            partyResult: message.getContent() as SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new PartyInfoCallbackReceivedDmEvt(data);
    }
}
