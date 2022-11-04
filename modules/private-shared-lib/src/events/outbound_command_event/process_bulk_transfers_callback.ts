'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@module-types';
import { BulkTransferErrorResponse, BulkTransferResponse } from '../../types';

export interface IProcessBulkTransfersCallbackCmdEvtData {
    bulkId: string;
    content: {
        batchId: string;
        bulkTransfersResult?: BulkTransferResponse;
        bulkTransfersErrorResult?: BulkTransferErrorResponse;
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

    get bulkTransferId(): string | undefined {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.bulkTransfersResult?.bulkTransferId;
    }

    get bulkTransfersResult(): BulkTransferResponse | undefined {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.bulkTransfersResult;
    }

    get bulkTransfersErrorResult(): BulkTransferErrorResponse | undefined {
        const content = this.getContent() as IProcessBulkTransfersCallbackCmdEvtData['content'];
        return content.bulkTransfersErrorResult;
    }
}
