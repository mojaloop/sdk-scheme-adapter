
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
    WAITING_FOR_CONVERSION_ACCEPTANCE: 'WAITING_FOR_CONVERSION_ACCEPTANCE',
    WAITING_FOR_QUOTE_ACCEPTANCE: 'WAITING_FOR_QUOTE_ACCEPTANCE',
    QUOTE_REQUEST_RECEIVED: 'QUOTE_REQUEST_RECEIVED',
    FX_QUOTE_REQUEST_RECEIVED: 'FX_QUOTE_REQUEST_RECEIVED',
    FX_QUOTE_WAITING_FOR_ACCEPTANCE: 'FX_QUOTE_WAITING_FOR_ACCEPTANCE',
    FX_PREPARE_RECEIVED: 'FX_PREPARE_RECEIVED',
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

const Directions = Object.freeze({
    INBOUND: 'INBOUND',
    OUTBOUND: 'OUTBOUND',
});

const CacheKeyPrefixes = Object.freeze({
    FX_QUOTE_INBOUND: 'fxQuote_in',
    FX_QUOTE_CALLBACK_CHANNEL: 'fxQuote_callback',
    FX_TRANSFER_CALLBACK_CHANNEL: 'fxTransfer_callback',
});

const CurrencyConverters = Object.freeze({ // think, if we need it?
    PAYER: 'PAYER',
    PAYEE: 'PAYEE',
});

const Initiator = Object.freeze({
    PAYER: 'PAYER',
    PAYEE: 'PAYEE',
});

const InitiatorTypes = Object.freeze({
    CONSUMER: 'CONSUMER',
    AGENT: 'AGENT',
    BUSINESS: 'BUSINESS',
    DEVICE: 'DEVICE',
});

const States = Object.freeze({
    START: 'start',
    PAYEE_RESOLVED: 'payeeResolved',
    SERVICES_FXP_RECEIVED: 'servicesFxpReceived',
    FX_QUOTE_RECEIVED: 'fxQuoteReceived',
    QUOTE_RECEIVED: 'quoteReceived',
    FX_TRANSFER_SUCCEEDED: 'fxTransferSucceeded',
    SUCCEEDED: 'succeeded',
    ERRORED: 'errored',
    ABORTED: 'aborted',
});

const Transitions  = Object.freeze({
    RESOLVE_PAYEE: 'resolvePayee',
    REQUEST_SERVICES_FXP: 'requestServicesFxp',
    REQUEST_FX_QUOTE: 'requestFxQuote',
    REQUEST_QUOTE: 'requestQuote',
    EXECUTE_FX_TRANSFER: 'executeFxTransfer',
    EXECUTE_TRANSFER: 'executeTransfer',
    GET_TRANSFER: 'getTransfer',
    ERROR: 'error',
    ABORT: 'abort'
});

const ErrorMessages = Object.freeze({
    invalidFulfilment: 'Invalid fulfilment received',
    noFxProviderDetected: 'No FX provider detected',
    noSupportedCurrencies: 'No payee supportedCurrencies received',
    responseMissedExpiryDeadline: 'Response missed expiry deadline',
    quoteRejectedByBackend: 'Quote rejected by backend',
    fxQuoteRejectedByBackend: 'FX quote rejected by backend',
});

const AmountTypes = Object.freeze({
    SEND: 'SEND',
    RECEIVE: 'RECEIVE',
});

module.exports = {
    AmountTypes,
    CacheKeyPrefixes,
    CurrencyConverters,
    Directions,
    ErrorMessages,
    Initiator,
    InitiatorTypes,
    SDKStateEnum,
    States,
    TransactionRequestStateEnum,
    Transitions,
};
