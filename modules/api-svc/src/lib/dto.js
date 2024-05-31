/*eslint quote-props: ["error", "as-needed"]*/
const randomUUID = require('@mojaloop/central-services-shared').Util.id();
const { Directions, SDKStateEnum} = require('./model/common');

const quoteRequestStateDto = (request) => ({
    // transferId: this follows the slightly dodgy assumption that transferId will be same as this transactionId.
    // so far this has held in moja implementations but may not always be the case. regardless, future FSPIOP API
    // versions MUST deal with this cleanly so we can expect to eliminate this assumption at some point.
    transferId: request.body.transactionId,
    direction: Directions.INBOUND,
    quoteRequest: {
        headers: request.headers,
        body: request.body
    },
    currentState: SDKStateEnum.QUOTE_REQUEST_RECEIVED,
    initiatedTimestamp: new Date().toISOString(),
});

const fxQuoteRequestStateDto = (request) => ({
    // assume commitRequestId from fxTransfer should be same as conversionTerms.conversionId from fxQuotes
    conversionId: request.body.conversionTerms.conversionId,
    fxQuoteRequest: request,
    direction: Directions.INBOUND,
    currentState: SDKStateEnum.FX_QUOTE_REQUEST_RECEIVED,
    initiatedTimestamp: new Date().toISOString(),
});

/**
 * @param data {object} - "state" of inbound transaction request
 */
const outboundPostFxQuotePayloadDto = (data) => Object.freeze({
    conversionRequestId: randomUUID(),
    conversionTerms: {
        conversionId: randomUUID(), // should be the same as commitRequestId from fxTransfer
        initiatingFsp: data.from.fspId,
        counterPartyFsp: data.fxProviders[0], // todo: think if we have several FXPs
        amountType: data.amountType,
        sourceAmount: {
            currency: data.currency,
            amount: data.amount
        },
        targetAmount: {
            currency: data.supportedCurrencies[0], // todo: think if we have several currencies
        },
        expiration: data.fxQuoteExpiration,
    }
});

/**
 * @param data {object} - "state" of inbound transaction request
 */
const outboundPostFxTransferPayloadDto = (data) => {
    const { condition, conversionTerms } = data.fxQuoteResponse.body;
    // eslint-disable-next-line no-unused-vars
    const { conversionId, charges, extensionList,  ...rest } =  conversionTerms;
    return Object.freeze({
        ...rest,
        condition,
        commitRequestId: conversionId, // should be the same as conversionTerms.conversionId from fxQuote
        determiningTransferId: data.transferId,
        expiration: data.fxTransferExpiration,
    });
};

module.exports = {
    quoteRequestStateDto,
    fxQuoteRequestStateDto,
    outboundPostFxQuotePayloadDto,
    outboundPostFxTransferPayloadDto,
};
