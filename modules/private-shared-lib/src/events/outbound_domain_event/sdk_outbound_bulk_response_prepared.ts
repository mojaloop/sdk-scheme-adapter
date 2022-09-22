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
 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

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
