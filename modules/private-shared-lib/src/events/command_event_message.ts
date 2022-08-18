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

import { IMessage } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { IEventMessageData, EventMessageType, BaseEventMessage, IEventMessageValue } from './base_event_message';

export type ICommandEventMessageData = Omit<IEventMessageData, 'type'>;

export class CommandEventMessage extends BaseEventMessage {

    constructor(data: ICommandEventMessageData) {
        super({
            ...data,
            type: EventMessageType.COMMAND_EVENT,
        });
    }

    static CreateFromIMessage(message: IMessage): CommandEventMessage {
    // Validate message
        this._validateMessage(message);
        // Prepare Data
        /* eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars */
        const { type, ...data } = super._prepareDataFromIMessage(message);
    
        return new CommandEventMessage(data);
    }

    // Overriding the parent method and perform additional validations
    protected static _validateMessage(obj: IMessage): void {
        super._validateMessage(obj);
        // Additional validation here
        const eventMessageValue = obj.value as IEventMessageValue
        if(eventMessageValue.eventMessageType !== EventMessageType.COMMAND_EVENT) {
            throw (new Error('.value.eventMessageName is not equal to COMMAND_EVENT'));
        }
    }

}
