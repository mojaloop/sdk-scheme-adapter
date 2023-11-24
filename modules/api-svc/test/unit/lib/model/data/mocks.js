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
    determiningTransferId = 'b51ec534-ee48-4575-b6a9-ead2955b8069',
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
    mockMojaApiResponse,
    mockCurrencyAmount,
};
