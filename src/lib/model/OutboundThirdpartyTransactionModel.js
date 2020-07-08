/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/

'use strict';

function notificationChannel(id) {
    // mvp validation
    if (!(id && id.toString().length > 0)) {
        throw new Error('OutboundThirdpartyTransactionModel.notificationChannel: \'id\' parameter is required');
    }

    // channel name
    return `3ptrxnreq_${id}`;
}

async function publishNotifications(cache, id, value) {
    const channel = notificationChannel(id);
    return cache.publish(channel, value);
}

module.exports = { notificationChannel, publishNotifications };