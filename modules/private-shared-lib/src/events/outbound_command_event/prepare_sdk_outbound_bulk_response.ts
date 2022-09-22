'use strict';

import { CommandEvent } from '../command_event';
import { IMessageHeader } from '@mojaloop/platform-shared-lib-messaging-types-lib';

export interface IPrepareSDKOutboundBulkResponseCmdEvtData {
    bulkId: string;
    content: null;
    timestamp: number | null;
    headers: IMessageHeader[] | null;
}
export class PrepareSDKOutboundBulkResponseCmdEvt extends CommandEvent {
    constructor(data: IPrepareSDKOutboundBulkResponseCmdEvtData) {
        super({
            key: data.bulkId,
            timestamp: data.timestamp,
            headers: data.headers,
            content: null,
            name: PrepareSDKOutboundBulkResponseCmdEvt.name,
        });
    }

    static CreateFromCommandEvent(message: CommandEvent): PrepareSDKOutboundBulkResponseCmdEvt {
        if((message.getKey() === null || typeof message.getKey() !== 'string')) {
            throw new Error('Bulk id is in unknown format');
        }
        const data: IPrepareSDKOutboundBulkResponseCmdEvtData = {
            timestamp: message.getTimeStamp(),
            headers: message.getHeaders(),
            content: message.getContent() as IPrepareSDKOutboundBulkResponseCmdEvtData['content'],
            bulkId: message.getKey(),
        };
        return new PrepareSDKOutboundBulkResponseCmdEvt(data);
    }
}
