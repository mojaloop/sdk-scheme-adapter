'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@module-types';

export interface IProcessSDKOutboundBulkTransfersRequestCompleteCmdEvtData {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}
export class ProcessSDKOutboundBulkTransfersRequestCompleteCmdEvt extends CommandEvent {
    constructor(data: IProcessSDKOutboundBulkTransfersRequestCompleteCmdEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: ProcessSDKOutboundBulkTransfersRequestCompleteCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): ProcessSDKOutboundBulkTransfersRequestCompleteCmdEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IProcessSDKOutboundBulkTransfersRequestCompleteCmdEvtData = {
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            content: message.getContent() as IProcessSDKOutboundBulkTransfersRequestCompleteCmdEvtData['content'],
            bulkId: message.getKey(),
        };
        return new ProcessSDKOutboundBulkTransfersRequestCompleteCmdEvt(data);
    }
}
