/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 * Modusbox
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict';
// import { v4 as uuidv4 } from 'uuid'
import { IMessage, IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { getEnumValues } from '../utils';

export enum EventType {
    'DOMAIN_EVENT' = 'DOMAIN_EVENT', // public domain events
    'COMMAND_EVENT' = 'COMMAND_EVENT', // commands
}

// export type TTraceInfo = {
//   traceParent: string
//   traceState: string
// }

export interface IEventValue {
    eventType: EventType;
    eventName: string;
    eventContent: Buffer | string | object | null;
}

export interface IEventData {
    key: string;
    type: EventType;
    name: string;
    content: Buffer | string | object | null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class BaseEvent {
    private _data: IEventData;

    constructor(data: IEventData) {
        this._data = data;
    }

    getData(): IEventData {
        return this._data;
    }

    getKey(): string {
        return this._data.key;
    }

    getType(): EventType {
        return this._data.type;
    }

    getName(): string {
        return this._data.name;
    }

    getContent(): Buffer | string | object | null {
        return this._data.content;
    }

    getTimeStamp(): number | null {
        return this._data.timestamp;
    }

    getHeaders(): IMessageHeader[] | null {
        return this._data.headers;
    }

    static CreateFromIMessage(message: IMessage): BaseEvent {
    // Validate message
        this._validateMessage(message);
        // Prepare Data
        const data = this._prepareDataFromIMessage(message);

        return new BaseEvent(data);
    }

    protected static _prepareDataFromIMessage(message: IMessage): IEventData {
        const eventMessageValue: IEventValue = <IEventValue>message.value;
        const data: IEventData = {
            key: message.key as string,
            type: eventMessageValue.eventType,
            name: eventMessageValue.eventName,
            content: eventMessageValue.eventContent,
            timestamp: message.timestamp,
            headers: message.headers,
        };
        return data;
    }

    toIMessage(topic: string): IMessage {
        const eventMessageValue: IEventValue = {
            eventType: this._data.type,
            eventName: this._data.name,
            eventContent: this._data.content,
        };
        const message: IMessage = {
            value: eventMessageValue,
            topic,
            key: this._data.key,
            timestamp: this._data.timestamp,
            headers: this._data.headers,
        };
        return message;
    }


    protected static _validateMessage(obj: IMessage): void {
        if(obj.key === null || obj.key === undefined) {
            throw (new Error('.key is null or undefined'));
        }
        if(
            obj.value === null ||
            obj.value === undefined ||
            typeof obj.value !== 'object' ||
            Buffer.isBuffer(obj.value)
        ) {
            throw (new Error('.value is null or undefined or not an object'));
        }
        const eventMessageValue = obj.value as IEventValue;
        if( !eventMessageValue.hasOwnProperty('eventType')) {
            throw (new Error('.value.eventType is null or undefined'));
        }
        if(typeof eventMessageValue.eventType !== 'string') {
            throw (new Error('.value.eventType is not string'));
        }
        if(!(eventMessageValue.eventType in EventType)) {
            throw (new Error(`.value.eventType is not in the list of allowed values ${getEnumValues(EventType)}`));
        }
        if( !eventMessageValue.hasOwnProperty('eventName')) {
            throw (new Error('.value.eventName is null or undefined'));
        }
        if(typeof eventMessageValue.eventName !== 'string') {
            throw (new Error('.value.eventName is not string'));
        }
    }
}
