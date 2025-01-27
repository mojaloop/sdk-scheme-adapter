/*eslint quote-props: ["error", "as-needed"]*/
const randomUUID = require('@mojaloop/central-services-shared').Util.id({ type: 'ulid' });
const { AmountTypes } = require('../../../../../src/lib/model/common');

const DEFAULT_ID_VALUE = '2551234567890';

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
    amountType = AmountTypes.SEND,
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

const mockFxQuotesResponse = ({
    condition = '3scAs9T4nie3OsHy8DqswhOXKiQqoLOMu0Q8q-ob_Kq',
    conversionId = randomUUID(),
    determiningTransferId = randomUUID(),
    initiatingFsp = 'initiatingFsp',
    counterPartyFsp = 'fxpId',
    amountType = AmountTypes.SEND,
    sourceAmount = mockCurrencyAmount(),
    targetAmount = mockCurrencyAmount(),
    expiration = new Date().toISOString(),
} = {}) => Object.freeze({
    condition,
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
    amount = '300',
    amountType = AmountTypes.SEND,
    idType = 'MSISDN',
    idValue = DEFAULT_ID_VALUE
} = {}) => Object.freeze({
    homeTransactionId,
    from: {
        fspId,
        dateOfBirth: '1966-06-16',
        displayName: 'Keeya',
        firstName: 'Keeya',
        idType: 'MSISDN',
        idValue: '26787654321',
    },
    to: {
        idType,
        idValue,
    },
    amountType,
    currency,
    amount
});

const mockPutQuotesResponse = ({
    currency = 'BWP',
    amount = '300',
    ilpPacket = 'This is encoded transaction object...',
    condition = 'HOr22-H3AfTDHrSkPjJtVPRdKouuMkDXTR4ejlQa8Ks',
    expiration = new Date().toISOString(),
} = {}) => Object.freeze({
    transferAmount: {
        currency,
        amount,
    },
    payeeReceiveAmount: {
        currency,
        amount: '299'
    },
    payeeFspFee: {
        currency,
        amount: '1'
    },
    ilpPacket,
    condition,
    expiration,
});

const mockGetPartyResponse = ({
    supportedCurrencies = ['TZS'],
    kycInformation = 'Encrypted KYC Data',
    fspId = 'MobileMoney',
    partyIdType = 'MSISDN',
    partyIdentifier =  DEFAULT_ID_VALUE
} = {}) => Object.freeze({
    party: {
        partyIdInfo: {
            fspId,
            partyIdType,
            partyIdentifier,
            // partySubIdOrType: 'PASSPORT',
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
    mockPutQuotesResponse,
    mockMojaApiResponse,
    mockCurrencyAmount,
    mockFxQuotesResponse
};
