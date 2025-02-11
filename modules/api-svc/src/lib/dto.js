/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 --------------
 ******/
/*eslint quote-props: ["error", "as-needed"]*/
const config = require('../config');
const randomUUID = require('@mojaloop/central-services-shared').Util.id(config.idGenerator);
const { Directions, SDKStateEnum, AmountTypes } = require('./model/common');

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
 * Supports only single FXP and currency for now
 */
const outboundPostFxQuotePayloadDto = (data) => {
    let sourceAmount, targetAmount;
    
    sourceAmount = {
        currency: data.currency,
        amount: data.amount
    };
    targetAmount = {
        currency: data.supportedCurrencies[0],
    };

    if (data.amountType === AmountTypes.RECEIVE && !config.supportedCurrencies.includes(data.currency)) {
        sourceAmount = {
            currency: config.supportedCurrencies[0],
        };
        targetAmount = {
            currency: data.currency,
            amount: data.amount
        };
    }

    return Object.freeze({
        conversionRequestId: randomUUID(),
        conversionTerms: {
            conversionId: randomUUID(), // should be the same as commitRequestId from fxTransfer
            initiatingFsp: data.from.fspId,
            determiningTransferId: data.transferId,
            counterPartyFsp: data.fxProviders[0],
            amountType: data.amountType,
            sourceAmount,
            targetAmount,
            expiration: data.fxQuoteExpiration,
        }
    });
};

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
