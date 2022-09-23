'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

export interface IProcessBulkTransfersCallbackCmdEvtData {
    bulkId: string;
    content: {
        batchId: string;
        bulkTransferId: string;
        bulkTransfersResult: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransferResponse
    },
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}
export class ProcessBulkTransfersCallbackCmdEvt extends CommandEvent {
    constructor(data: IProcessBulkTransfersCallbackCmdEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: data.content,
            name: ProcessBulkTransfersCallbackCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): ProcessBulkTransfersCallbackCmdEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IProcessBulkTransfersCallbackCmdEvtData = {
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            content: message.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'],
            bulkId: message.getKey(),
        };
        return new ProcessBulkTransfersCallbackCmdEvt(data);
    }

    get batchId(): string {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.batchId;
    }

    get bulkTransferId(): string {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.bulkTransferId;
    }

    get bulkTransfersResult(): SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransferResponse {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.bulkTransfersResult;
    }
}