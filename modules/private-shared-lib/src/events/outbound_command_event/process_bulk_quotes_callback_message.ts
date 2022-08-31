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

import { CommandEventMessage } from '../command_event_message';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface IProcessBulkQuotesCallbackMessageData {
    key: string;
    content: {
        batchId: string;
        bulkQuoteId: string;
        bulkQuotesResult: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse;
    };
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class ProcessBulkQuotesCallbackMessage extends CommandEventMessage {
    constructor(data: IProcessBulkQuotesCallbackMessageData) {
        super({
            key: data.key,
            content: data.content,
            timestamp: data.timestamp,
            headers: data.headers,
            name: ProcessBulkQuotesCallbackMessage.name,
        });
    }

    static CreateFromCommandEventMessage(message: CommandEventMessage): ProcessBulkQuotesCallbackMessage {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IProcessBulkQuotesCallbackMessageData = {
            key: message.getKey(),
            content: message.getContent() as IProcessBulkQuotesCallbackMessageData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new ProcessBulkQuotesCallbackMessage(data);
    }

    get batchId(): string {
        const content = this.getContent() as IProcessBulkQuotesCallbackMessageData['content'];
        return content.batchId;
    }

    get bulkQuoteId(): string {
        const content = this.getContent() as IProcessBulkQuotesCallbackMessageData['content'];
        return content.bulkQuoteId;
    }

    get bulkQuotesResult(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse {
        const content = this.getContent() as IProcessBulkQuotesCallbackMessageData['content'];
        return content.bulkQuotesResult;
    }
}
