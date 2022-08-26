'use strict';

import { DomainEventMessage } from '../domain_event_message';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { IPartyResult } from '../../types';

export interface IPartyInfoCallbackReceivedMessageData {
    key: string;
    partyResult: IPartyResult;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class PartyInfoCallbackReceivedMessage extends DomainEventMessage {
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

    getPartyResult(): IPartyResult {
        return this.getContent() as IPartyResult;
    }

    static CreateFromDomainEventMessage(message: DomainEventMessage): PartyInfoCallbackReceivedMessage {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IPartyInfoCallbackReceivedMessageData = {
            key: message.getKey(),
            partyResult: <IPartyResult>message.getContent(),
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new PartyInfoCallbackReceivedMessage(data);
    }
}
