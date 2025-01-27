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
 --------------
 ******/

'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@module-types';
import { BulkQuoteErrorResponse, BulkQuoteResponse } from '../../types';

export interface IProcessBulkQuotesCallbackCmdEvtData {
    bulkId: string;
    content: {
        batchId: string;
        bulkQuoteId: string;
        bulkQuotesResult?: BulkQuoteResponse;
        bulkQuotesErrorResult?: BulkQuoteErrorResponse;
    };
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}

export class ProcessBulkQuotesCallbackCmdEvt extends CommandEvent {
    constructor(data: IProcessBulkQuotesCallbackCmdEvtData) {
        super({
            key: data.bulkId,
            content: data.content,
            timestamp: data.timestamp,
            headers: data.headers,
            name: ProcessBulkQuotesCallbackCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): ProcessBulkQuotesCallbackCmdEvt {
        if((message.getContent() === null || typeof message.getContent() !== 'object')) {
            throw new Error('Content is in unknown format');
        }
        const data: IProcessBulkQuotesCallbackCmdEvtData = {
            bulkId: message.getKey(),
            content: message.getContent() as IProcessBulkQuotesCallbackCmdEvtData['content'],
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
        };
        return new ProcessBulkQuotesCallbackCmdEvt(data);
    }

    get batchId(): string {
        const content = this.getContent() as IProcessBulkQuotesCallbackCmdEvtData['content'];
        return content.batchId;
    }

    get bulkQuoteId(): string {
        const content = this.getContent() as IProcessBulkQuotesCallbackCmdEvtData['content'];
        return content.bulkQuoteId;
    }

    get bulkQuotesResult(): BulkQuoteResponse | undefined {
        const content = this.getContent() as IProcessBulkQuotesCallbackCmdEvtData['content'];
        return content.bulkQuotesResult;
    }

    get bulkQuotesErrorResult(): BulkQuoteErrorResponse | undefined {
        const content = this.getContent() as IProcessBulkQuotesCallbackCmdEvtData['content'];
        return content.bulkQuotesErrorResult;
    }
}
