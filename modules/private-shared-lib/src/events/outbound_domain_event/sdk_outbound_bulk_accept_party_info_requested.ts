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
import { IndividualTransferError } from '@module-domain';

export type CoreConnectorBulkAcceptPartyInfoRequestIndividualTransferResult = {
    homeTransactionId: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionIndividualTransfer['homeTransactionId'];
    transferId: string;
    transactionId: string;
    to?: SDKSchemeAdapter.V2_1_0.Outbound.Types.Party;
    lastError: IndividualTransferError
};

export type CoreConnectorBulkAcceptPartyInfoRequest = {
    bulkHomeTransactionID: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest['bulkHomeTransactionID'];
    bulkTransactionId: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest['bulkTransactionId'];
    individualTransferResults: CoreConnectorBulkAcceptPartyInfoRequestIndividualTransferResult[];
};

export interface ISDKOutboundBulkAcceptPartyInfoRequestedDmEvtData {
    bulkId: string;
    request: CoreConnectorBulkAcceptPartyInfoRequest;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class SDKOutboundBulkAcceptPartyInfoRequestedDmEvt extends DomainEvent {
    constructor(data: ISDKOutboundBulkAcceptPartyInfoRequestedDmEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: data.request,
            name: SDKOutboundBulkAcceptPartyInfoRequestedDmEvt.name,
        });
    }

    static CreateFromDomainEvent(message: DomainEvent): SDKOutboundBulkAcceptPartyInfoRequestedDmEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: ISDKOutboundBulkAcceptPartyInfoRequestedDmEvtData = {
            bulkId: message.getKey(),
            request: message.getContent() as CoreConnectorBulkAcceptPartyInfoRequest,
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new SDKOutboundBulkAcceptPartyInfoRequestedDmEvt(data);
    }
}
