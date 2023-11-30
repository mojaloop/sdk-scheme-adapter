/*eslint quote-props: ["error", "as-needed"]*/
const { randomUUID } = require('node:crypto');

const mockCurrencyAmount = ({
    currency = 'AED',
    amount = '123.45'
} = {}) => Object.freeze({
    currency,
    amount
});

const mockFxQuotesPayload = ({
    conversionRequestId = randomUUID(),
    conversionId = randomUUID(),
    determiningTransferId = randomUUID(),
    initiatingFsp = 'initiatingFsp',
    counterPartyFsp = 'fxpId',
    amountType = 'RECEIVE',
    sourceAmount = mockCurrencyAmount(),
    targetAmount = mockCurrencyAmount(),
    expiration = new Date().toISOString(),
} = {}) => Object.freeze({
    conversionRequestId,
    conversionTerms: {
        conversionId,
        determiningTransferId,
        initiatingFsp,
        counterPartyFsp,
        amountType,
        sourceAmount,
        targetAmount,
        expiration
    }
});

const mockFxQuotesInternalResponse = ({
    homeTransactionId = randomUUID(),
    fxQuotePayload = mockFxQuotesPayload(),
    sourceAmount,
    targetAmount,
} = {}) => Object.freeze({
    homeTransactionId,
    ...fxQuotePayload,
    ...(sourceAmount && { sourceAmount }),
    ...(targetAmount && { targetAmount }),
});

const mockFxTransfersPayload = ({
    commitRequestId = randomUUID(),
    determiningTransferId = randomUUID(),
    initiatingFsp = 'initiatingFsp',
    counterPartyFsp = 'fxpId',
    sourceAmount = mockCurrencyAmount(),
    targetAmount = mockCurrencyAmount(),
    condition = '3scAs9T4nie3OsHy8DqswhOXKiQqoLOMu0Q8q-ob_Kq',
    expiration = new Date().toISOString()
} = {}) => Object.freeze({
    commitRequestId,
    determiningTransferId,
    initiatingFsp,
    counterPartyFsp,
    sourceAmount,
    targetAmount,
    condition,
    expiration
});

const mockFxTransfersInternalResponse = ({
    homeTransactionId = randomUUID(),
    fulfilment = 'WLctttbu2HvTsa1XWvUoGRcQozHsqeu9Ahl2JW9Bsu8',
    completedTimestamp = new Date().toISOString(),
    conversionState = 'RESERVED'
} = {}) => Object.freeze({
    homeTransactionId,
    fulfilment,
    completedTimestamp,
    conversionState
});

const mockMojaApiResponse = ({
    headers = {},
    body = {}
} = {}) => Object.freeze({
    originalRequest: {
        headers,
        body,
    }
});

module.exports = {
    mockFxQuotesPayload,
    mockFxQuotesInternalResponse,
    mockFxTransfersPayload,
    mockFxTransfersInternalResponse,
    mockMojaApiResponse,
    mockCurrencyAmount,
};
