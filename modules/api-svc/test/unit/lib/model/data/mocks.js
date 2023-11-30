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

const coreConnectorPostTransfersPayloadDto = ({
    homeTransactionId = randomUUID(),
    fspId = 'PayerFSP',
    currency = 'BWP',
    amount = '300'
} = {}) => Object.freeze({
    homeTransactionId,
    from: {
        fspId,
        dateOfBirth: '1966-06-16',
        displayName: 'Keeya',
        firstName: 'Keeya',
        idType: 'MSISDN',
        idValue: '26787654321'
    },
    to: {
        idType: 'MSISDN',
        idValue: '2551234567890'
    },
    amountType: 'SEND',
    currency,
    amount
});

const mockGetPartyResponse = ({
    supportedCurrencies = ['TZS'],
    kycInformation = 'Encrypted KYC Data',
    fspId = 'MobileMoney',
} = {}) => Object.freeze({
    party: {
        partyIdInfo: {
            partyIdType: 'PERSONAL_ID',
            partyIdentifier: '123456789',
            partySubIdOrType: 'PASSPORT',
            fspId
        },
        personalInfo: {
            complexName: {
                firstName: 'John',
                lastName: 'Doe'
            },
            kycInformation
        },
        supportedCurrencies
    }
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
    coreConnectorPostTransfersPayloadDto,
    mockFxQuotesPayload,
    mockFxQuotesInternalResponse,
    mockFxTransfersPayload,
    mockFxTransfersInternalResponse,
    mockGetPartyResponse,
    mockMojaApiResponse,
    mockCurrencyAmount,
};
