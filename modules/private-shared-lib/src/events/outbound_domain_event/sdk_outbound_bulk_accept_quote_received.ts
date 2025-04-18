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
 - Miguel de Barros <miguel.debarros@modusbox.com>
 --------------
 ******/

'use strict';

import { DomainEvent } from '../domain_event';
import { IMessageHeader } from '@module-types';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface ISDKOutboundBulkAcceptQuoteReceivedDmEvtData {
    bulkId: string;
    // eslint-disable-next-line max-len
    bulkTransactionContinuationAcceptQuote: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionContinuationAcceptQuote;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class SDKOutboundBulkAcceptQuoteReceivedDmEvt extends DomainEvent {

    constructor(data: ISDKOutboundBulkAcceptQuoteReceivedDmEvtData) {
        super({
            key: data.bulkId,
            content: data.bulkTransactionContinuationAcceptQuote,
            timestamp: data.timestamp,
            headers: data.headers,
            name: SDKOutboundBulkAcceptQuoteReceivedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkAcceptQuoteReceivedDmEvt {
        // Prepare Data
        const data = {
            bulkId: message.getKey(),
            // eslint-disable-next-line max-len
            bulkTransactionContinuationAcceptQuote: message.getContent() as SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionContinuationAcceptQuote,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkAcceptQuoteReceivedDmEvt(data);
    }

    // eslint-disable-next-line max-len
    getBulkTransactionContinuationAcceptQuote(): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionContinuationAcceptQuote {
        return this.getContent() as SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionContinuationAcceptQuote;
    }
}
