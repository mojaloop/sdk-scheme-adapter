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
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

type BulkTransactionResponse = SDKSchemeAdapter.V2_1_0.Backend.Types.bulkTransactionResponse;

export type ISDKOutboundBulkResponsePreparedDmEvtData = {
    bulkId: string;
    bulkTransactionResponse: BulkTransactionResponse;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
};


export class SDKOutboundBulkResponsePreparedDmEvt extends DomainEvent {
    constructor(data: ISDKOutboundBulkResponsePreparedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: data.bulkTransactionResponse,
            name: SDKOutboundBulkResponsePreparedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkResponsePreparedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: ISDKOutboundBulkResponsePreparedDmEvtData = {
            bulkId: message.getKey(),
            bulkTransactionResponse: message.getContent() as BulkTransactionResponse,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkResponsePreparedDmEvt(data);
    }

    get request(): BulkTransactionResponse {
        return this.getContent() as BulkTransactionResponse;
    }

}
