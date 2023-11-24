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

module.exports = {
    quoteRequestStateDto,
    fxQuoteRequestStateDto
};
