
/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

'use strict';

// NOTE: Stick all common SDK ENUMS here. SDKStateEnum is the first attempt at consolidating and cleaning up ENUMS in the SDK.

const SDKStateEnum = {
    WAITING_FOR_ACTION: 'WAITING_FOR_ACTION',
    WAITING_FOR_PARTY_ACCEPTANCE: 'WAITING_FOR_PARTY_ACCEPTANCE',
    WAITING_FOR_AUTH_ACCEPTANCE: 'WAITING_FOR_AUTH_ACCEPTANCE',
    QUOTE_REQUEST_RECEIVED: 'QUOTE_REQUEST_RECEIVED',
    WAITING_FOR_QUOTE_ACCEPTANCE: 'WAITING_FOR_QUOTE_ACCEPTANCE',
    PREPARE_RECEIVED: 'PREPARE_RECEIVED',
    ERROR_OCCURRED: 'ERROR_OCCURRED',
    COMPLETED: 'COMPLETED',
    ABORTED: 'ABORTED',
    RESERVED: 'RESERVED',
};

const TransactionRequestStateEnum = {
    RECEIVED: 'RECEIVED',
    PENDING: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
};

module.exports = {
    SDKStateEnum,
    TransactionRequestStateEnum
};
