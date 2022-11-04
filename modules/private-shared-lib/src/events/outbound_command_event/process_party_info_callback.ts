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
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@module-types';
import { PartyErrorResponse, PartyResponse } from '@module-types';

export interface IProcessPartyInfoCallbackCmdEvtData {
    bulkId: string;
    content: {
        transferId: string;
        partyResult?: PartyResponse;
        partyErrorResult?: PartyErrorResponse;
    };
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class ProcessPartyInfoCallbackCmdEvt extends CommandEvent {
    constructor(data: IProcessPartyInfoCallbackCmdEvtData) {
        super({
            key: data.bulkId,
            content: data.content,
            timestamp: data.timestamp,
            headers: data.headers,
            name: ProcessPartyInfoCallbackCmdEvt.name,
        });
    }

    get bulkId() {
        return this.getKey();
    }

    get transferId() {
        return (this.getContent() as IProcessPartyInfoCallbackCmdEvtData['content']).transferId;
    }

    get partyResult() {
        return (this.getContent() as IProcessPartyInfoCallbackCmdEvtData['content']).partyResult;
    }

    get partyErrorResult() {
        return (this.getContent() as IProcessPartyInfoCallbackCmdEvtData['content']).partyErrorResult;
    }

    static CreateFromCommandEvent(message: CommandEvent): ProcessPartyInfoCallbackCmdEvt {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IProcessPartyInfoCallbackCmdEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IProcessPartyInfoCallbackCmdEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new ProcessPartyInfoCallbackCmdEvt(data);
    }
}
