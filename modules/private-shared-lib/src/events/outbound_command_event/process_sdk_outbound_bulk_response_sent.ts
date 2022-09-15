'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export interface IProcessSDKOutboundBulkResponseSentCmdEvtData {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}
export class ProcessSDKOutboundBulkResponseSentCmdEvt extends CommandEvent {
    constructor(data: IProcessSDKOutboundBulkResponseSentCmdEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: ProcessSDKOutboundBulkResponseSentCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): ProcessSDKOutboundBulkResponseSentCmdEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IProcessSDKOutboundBulkResponseSentCmdEvtData = {
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            content: message.getContent() as IProcessSDKOutboundBulkResponseSentCmdEvtData['content'],
            bulkId: message.getKey(),
        };
        return new ProcessSDKOutboundBulkResponseSentCmdEvt(data);
    }
}
