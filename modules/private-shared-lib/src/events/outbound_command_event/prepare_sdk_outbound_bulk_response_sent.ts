'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export interface IPrepareSDKOutboundBulkResponseSentCmdEvtData {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}
export class PrepareSDKOutboundBulkResponseSentCmdEvt extends CommandEvent {
    constructor(data: IPrepareSDKOutboundBulkResponseSentCmdEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: PrepareSDKOutboundBulkResponseSentCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): PrepareSDKOutboundBulkResponseSentCmdEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IPrepareSDKOutboundBulkResponseSentCmdEvtData = {
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            content: message.getContent() as IPrepareSDKOutboundBulkResponseSentCmdEvtData['content'],
            bulkId: message.getKey(),
        };
        return new PrepareSDKOutboundBulkResponseSentCmdEvt(data);
    }
}
