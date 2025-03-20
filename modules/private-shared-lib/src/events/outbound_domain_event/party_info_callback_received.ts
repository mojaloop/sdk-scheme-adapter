/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>
 * Infitx
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';
import { PartyErrorResponse, PartyResponse } from '@module-types';

export interface IPartyInfoCallbackReceivedDmEvtData {
    bulkId: string;
    content: {
        transferId: string;
        partyResult?: PartyResponse;
        partyErrorResult?: PartyErrorResponse;
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

    get bulkId(): string {
        return this.getKey();
    }

    get transferId(): string {
        return (this.getContent() as IPartyInfoCallbackReceivedDmEvtData['content']).transferId;
    }

    get partyResult(): PartyResponse | undefined {
        return (this.getContent() as IPartyInfoCallbackReceivedDmEvtData['content']).partyResult;
    }

    get partyErrorResult(): PartyErrorResponse | undefined {
        return (this.getContent() as IPartyInfoCallbackReceivedDmEvtData['content']).partyErrorResult;
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

    // TODO: Add validation of events using the sample code below
    // private static validateContent (content: IPartyInfoCallbackReceivedDmEvtData['content']): void {
    //   if(!content.hasOwnProperty('transferId')) {
    //     throw(new Error('.transferId is not defined'))
    //   }
    //   if(!content.hasOwnProperty('partyResult')) {
    //     throw(new Error('.partyResult is not defined'))
    //   }
    //   if( content.partyResult.currentState === 'COMPLETED' ) {
    //       if (content.partyResult.hasOwnProperty('party')) {
    //         const partySchema = SDKSchemeAdapter.V2_1_0.Outbound.Schemas.Party;
    //         const validate = ajv.compile(partySchema);
    //         const validationResult = validate(content.partyResult.party);
    //         if(!validationResult) {
    //             throw new SchemaValidationError(validate.errors || []);
    //         }
    //     }
    //   }
    // }
}
