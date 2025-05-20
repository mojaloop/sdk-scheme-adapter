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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const { Errors } = require('@mojaloop/sdk-standard-components');
const FSPIOPBulkTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.BulkTransferState;
const ErrorHandling = require('@mojaloop/central-services-error-handling');


/**
 * Build a quote party object from an outgoing transfer API party
 *
 * @returns {object} - the constructed party object
 */
const internalPartyToMojaloopParty = (internal, fspId, supportedCurrencies) => {
    const party = {
        partyIdInfo: {
            partyIdType: internal.idType,
            partyIdentifier: internal.idValue,
            partySubIdOrType: internal.idSubValue,
            fspId: fspId
        }
    };
    if (internal.extensionList) {
        party.partyIdInfo.extensionList = {
            extension: internal.extensionList
        };
    }

    if (!internal.supportedCurrencies) {
        // add DFSP specific information to the response
        if (supportedCurrencies?.length > 0) {
            party.supportedCurrencies = supportedCurrencies;
        }
    } else if (internal.supportedCurrencies?.length > 0) {
        party.supportedCurrencies = internal.supportedCurrencies;
    }

    const hasComplexName = !!(internal.firstName || internal.middleName || internal.lastName);

    if(hasComplexName || internal.dateOfBirth) {
        party.personalInfo = {};
    }

    if(hasComplexName) {
        party.personalInfo.complexName = {};
    }

    if(internal.displayName) { party.name = internal.displayName; }
    if(internal.firstName) { party.personalInfo.complexName.firstName = internal.firstName; }
    if(internal.middleName) { party.personalInfo.complexName.middleName = internal.middleName; }
    if(internal.lastName) { party.personalInfo.complexName.lastName = internal.lastName; }

    if(internal.dateOfBirth) { party.personalInfo.dateOfBirth = internal.dateOfBirth; }

    if(internal.kycInformation) { party.personalInfo.kycInformation = internal.kycInformation; }

    if(typeof(internal.merchantClassificationCode) !== 'undefined') {
        party.merchantClassificationCode = internal.merchantClassificationCode;
    }

    return party;
};


/**
 * Converts a Mojaloop API spec party to an internal API spec party
 *
 * @returns {object} - the internal API spec party
 */
const mojaloopPartyToInternalParty = (external) => {
    const internal = {};

    if(external.partyIdInfo) {
        internal.idType = external.partyIdInfo.partyIdType;
        internal.idValue = external.partyIdInfo.partyIdentifier;
        internal.idSubValue = external.partyIdInfo.partySubIdOrType;
        internal.fspId = external.partyIdInfo.fspId;
        if(external.partyIdInfo.extensionList){
            internal.extensionList = external.partyIdInfo.extensionList.extension;
        }
    }

    if(external.name) {
        internal.displayName = external.name;
    }

    if(external.personalInfo) {
        if(external.personalInfo.dateOfBirth) {
            internal.dateOfBirth = external.personalInfo.dateOfBirth;
        }
        if(external.personalInfo.complexName) {
            if(external.personalInfo.complexName.firstName) {
                internal.firstName = external.personalInfo.complexName.firstName;
            }
            if(external.personalInfo.complexName.middleName) {
                internal.middleName = external.personalInfo.complexName.middleName;
            }
            if(external.personalInfo.complexName.lastName) {
                internal.lastName = external.personalInfo.complexName.lastName;
            }
        }
    }

    return internal;
};

/**
 * Converts a Mojaloop API spec partyIdInfo to an internal API spec party
 *
 * @returns {object} - the internal API spec party
 */
const mojaloopPartyIdInfoToInternalPartyIdInfo = (external) => {
    const internal = {};

    internal.idType = external.partyIdType;
    internal.idValue = external.partyIdentifier;
    internal.idSubValue = external.partySubIdOrType;
    internal.fspId = external.fspId;

    return internal;
};

/**
 * Projects a Mojaloop API spec quote request to internal form
 *
 * @returns {object} - the internal form quote request
 */
const mojaloopQuoteRequestToInternal = (external) => {
    const internal = {
        quoteId: external.quoteId,
        transactionId: external.transactionId,
        transactionRequestId: external.transactionRequestId,
        to: mojaloopPartyToInternalParty(external.payee),
        from: mojaloopPartyToInternalParty(external.payer),
        amountType: external.amountType,
        amount: external.amount.amount,
        currency: external.amount.currency,
        transactionType: external.transactionType.scenario,
        subScenario: external.transactionType.subScenario,
        initiator: external.transactionType.initiator,
        initiatorType: external.transactionType.initiatorType
    };

    if(external.fees) {
        internal.feesAmount = external.fees.amount;
        internal.feesCurrency = external.fees.currency;
    }

    if(external.geoCode) {
        internal.geoCode = external.geoCode;
    }

    if(external.note) {
        internal.note = external.note;
    }

    if(external.expiration) {
        internal.expiration = external.expiration;
    }

    if(external.extensionList) {
        internal.extensionList = external.extensionList.extension;
    }

    return internal;
};

/**
 * Projects a Mojaloop API spec PutTransactionRequest request to internal form
 *
 * @returns {object} - the internal form PutTransactionRequest
 */
const mojaloopPutTransactionRequestToInternal = (external) => {
    const internal = {
        transactionRequestState: external.transactionRequestState
    };
    return internal;
};


/**
 * Converts an internal quote response to mojaloop form
 *
 * @returns {object}
 */
const internalQuoteResponseToMojaloop = (internal) => {
    const external = {
        transferAmount: {
            amount: internal.transferAmount,
            currency: internal.transferAmountCurrency
        },
        expiration: internal.expiration,
        ilpPacket: internal.ilpPacket,
        condition: internal.ilpCondition
    };

    if(internal.payeeReceiveAmount) {
        external.payeeReceiveAmount = {
            amount: internal.payeeReceiveAmount,
            currency: internal.payeeReceiveAmountCurrency
        };
    }

    if(internal.payeeFspFeeAmount) {
        external.payeeFspFee = {
            amount: internal.payeeFspFeeAmount,
            currency: internal.payeeFspFeeAmountCurrency
        };
    }

    if(internal.payeeFspCommissionAmount) {
        external.payeeFspCommission = {
            amount: internal.payeeFspCommissionAmount,
            currency: internal.payeeFspCommissionAmountCurrency
        };
    }

    if(internal.geoCode) {
        external.geoCode = internal.geoCode;
    }

    if(internal.extensionList) {
        external.extensionList = { extension: internal.extensionList };
    }

    return external;
};

/**
 * Converts an internal quote response to mojaloop form
 *
 * @returns {object}
 */
const internalTransactionRequestResponseToMojaloop = (internal) => {
    const external = {
        transactionId: internal.transactionId,
        transactionRequestState: internal.transactionRequestState
    };

    if(internal.payeeReceiveAmount) {
        external.payeeReceiveAmount = {
            amount: internal.payeeReceiveAmount,
            currency: internal.payeeReceiveAmountCurrency
        };
    }

    if(internal.extensionList) {
        external.extensionList = internal.extensionList;
    }

    return external;
};


/**
 * Converts a mojaloop transfer prepare request to internal form
 *
 * @returns {object}
 */
const mojaloopPrepareToInternalTransfer = (external, quote, ilp, checkILP) => {
    let internal = null;
    if(quote) {
        internal = {
            transferId: external.transferId,
            transactionRequestId: quote.request.transactionRequestId,
            homeR2PTransactionId: quote.internalRequest.homeR2PTransactionId,
            quote: quote.response,
            from: quote.internalRequest.from,
            to: quote.internalRequest.to,
            amountType: quote.request.amountType,
            currency: quote.request.amount.currency,
            amount: quote.request.amount.amount,
            transactionType: quote.request.transactionType.scenario,
            subScenario: quote.request.transactionType.subScenario,
            note: quote.request.note
        };
        if (quote.internalRequest && quote.internalRequest.extensionList) {
            internal.quoteRequestExtensions = [ ...quote.internalRequest.extensionList ];
        }
        if (checkILP) {
            internal.ilpPacket = { data: ilp.getTransactionObject(external.ilpPacket) };
        }
    } else {
        internal = {
            transferId: external.transferId,
            currency: external.amount.currency,
            amount: external.amount.amount,
        };
    }

    if(external.extensionList) {
        internal.extensionList = external.extensionList.extension;
    }

    return internal;
};

/**
 * Converts a mojaloop transactionRequest data to internal form
 *
 * @returns {object}
 */
const mojaloopTransactionRequestToInternal = (external) => {
    let internal = null;
    internal = {
        transactionRequestId: external.transactionRequestId,
        to: mojaloopPartyToInternalParty(external.payee),
        from: mojaloopPartyIdInfoToInternalPartyIdInfo(external.payer),
        amount: external.amount.amount,
        currency: external.amount.currency,
        transactionType: external.transactionType.scenario,
        subScenario: external.transactionType.subScenario,
        initiator: external.transactionType.initiator,
        initiatorType: external.transactionType.initiatorType,
        authenticationType: external.authenticationType
    };

    return internal;
};

/**
 * Projects a Mojaloop API spec bulk quote request to internal form
 *
 * @returns {object} - the internal form bulk quote request
 */
const mojaloopBulkQuotesRequestToInternal = (external) => {
    const internal = {
        bulkQuoteId: external.bulkQuoteId,
        from: mojaloopPartyToInternalParty(external.payer),
    };

    if (external.geoCode) {
        internal.geoCode = external.geoCode;
    }

    if (external.expiration) {
        internal.expiration = external.expiration;
    }

    if (external.extensionList) {
        internal.extensionList = external.extensionList.extension;
    }

    const internalIndividualQuotes = external.individualQuotes.map(quote => {
        const internalQuote = {
            quoteId: quote.quoteId,
            transactionId: quote.transactionId,
            to: mojaloopPartyToInternalParty(quote.payee),
            amountType: quote.amountType,
            amount: quote.amount.amount,
            currency: quote.amount.currency,
            transactionType: quote.transactionType.scenario,
            subScenario: quote.transactionType.subScenario,
            initiator: quote.transactionType.initiator,
            initiatorType: quote.transactionType.initiatorType
        };

        if (quote.fees) {
            internalQuote.feesAmount = quote.fees.amount;
            internalQuote.feesCurrency = quote.fees.currency;
        }

        if (quote.note) {
            internalQuote.note = quote.note;
        }

        return internalQuote;
    });

    internal.individualQuotes = internalIndividualQuotes;

    return internal;
};
/**
 * Projects a Mojaloop API spec bulk quote response to internal form
 *
 * @returns {object} - the internal form bulk quote response
 */
const mojaloopBulkQuotesResponseToInternal = (external) => {
    const internal = {
        bulkQuoteId: external.bulkQuoteId
    };

    if (external.homeTransactionId) {
        internal.homeTransactionId = external.homeTransactionId;
    }

    if (external.bulkQuotesResponse?.expiration) {
        internal.expiration = external.bulkQuotesResponse.expiration;
    }

    if (external.bulkQuotesResponse?.extensionList) {
        internal.extensionList = external.bulkQuotesResponse.extensionList;
    }
    const individualQuoteResults = external.bulkQuotesResponse?.individualQuoteResults?.map((quote) => {
        let internalQuote = {
            ...quote
        };
        delete internalQuote.errorInformation;

        if(quote.errorInformation) {
            internalQuote.lastError = {
                mojaloopError: {
                    errorInformation: quote.errorInformation
                }
            };
        }
        return internalQuote;
    });

    internal.individualQuoteResults = individualQuoteResults;

    return internal;
};

/**
 * Converts an internal bulk quotes response to mojaloop form
 *
 * @returns {object}
 */
const internalBulkQuotesResponseToMojaloop = (internal) => {
    const individualQuoteResults = internal.individualQuoteResults.map((quote) => {
        let externalQuote;

        if(quote.errorResponse) {
            let error;
            try {
                // Throws error if invalid
                ErrorHandling.ValidateFSPIOPErrorGroups(quote.errorResponse.statusCode);

                const mojaloopApiErrorCode = ErrorHandling.Enums.findFSPIOPErrorCode(quote.errorResponse.statusCode) || {
                    code: quote.errorResponse.statusCode,
                    message: quote.errorResponse.message
                };

                error = new ErrorHandling.Factory.FSPIOPError(
                    quote.errorResponse.message,
                    quote.errorResponse.message,
                    null,
                    mojaloopApiErrorCode,
                    null,
                );
            } catch  {
                // If error status code isn't FSPIOP conforming, create generic
                // FSPIOP error and include backend code and message in FSPIOP message.
                error = new ErrorHandling.Factory.FSPIOPError(
                    quote.errorResponse.message,
                    `${quote.errorResponse.statusCode} - ${quote.errorResponse.message}`,
                    null,
                    Errors.MojaloopApiErrorCodes.CLIENT_ERROR,
                    null,
                    true
                );
            }

            externalQuote = {
                quoteId: quote.quoteId,
                errorInformation: error.toApiErrorObject().errorInformation,
            };
        } else {
            externalQuote = {
                quoteId: quote.quoteId,
                transferAmount: {
                    amount: quote.transferAmount,
                    currency: quote.transferAmountCurrency,
                },
                ilpPacket: quote.ilpPacket,
                condition: quote.ilpCondition
            };

            if (quote.payeeReceiveAmount) {
                externalQuote.payeeReceiveAmount = {
                    amount: quote.payeeReceiveAmount,
                    currency: quote.payeeReceiveAmountCurrency
                };
            }

            if (quote.payeeFspFeeAmount) {
                externalQuote.payeeFspFee = {
                    amount: quote.payeeFspFeeAmount,
                    currency: quote.payeeFspFeeAmountCurrency
                };
            }

            if (quote.payeeFspCommissionAmount) {
                externalQuote.payeeFspCommission = {
                    amount: quote.payeeFspCommissionAmount,
                    currency: quote.payeeFspCommissionAmountCurrency
                };
            }

        }

        return externalQuote;
    });
    const external = {
        individualQuoteResults,
        expiration: internal.expiration,
    };

    if (internal.geoCode) {
        external.geoCode = internal.geoCode;
    }

    if (internal.extensionList) {
        external.extensionList = internal.extensionList;
    }

    return external;
};

/**
 * Converts an internal bulk transfer response to mojaloop POST /bulkTransfers/{ID} response
 *
 * @returns {object}
 */
const internalBulkTransfersResponseToMojaloop = (internal, fulfilments) => {
    const external = {
        completedTimestamp: new Date(),
        bulkTransferState: FSPIOPBulkTransferStateEnum.COMPLETED,
    };

    if(internal.individualTransferResults && internal.individualTransferResults.length) {
        const individualTransferResults = internal.individualTransferResults.map((transfer) => {
            let externalTransfer;

            if(transfer.errorResponse) {
                let error;
                try {
                    // Throws error if invalid
                    ErrorHandling.ValidateFSPIOPErrorGroups(transfer.errorResponse.statusCode);

                    const mojaloopApiErrorCode = ErrorHandling.Enums.findFSPIOPErrorCode(transfer.errorResponse.statusCode) || {
                        code: transfer.errorResponse.statusCode,
                        message: transfer.errorResponse.message
                    };

                    error = new ErrorHandling.Factory.FSPIOPError(
                        transfer.errorResponse.message,
                        transfer.errorResponse.message,
                        null,
                        mojaloopApiErrorCode,
                        null,
                    );

                    externalTransfer = {
                        transferId: transfer.transferId,
                        errorInformation: error.toApiErrorObject().errorInformation,
                    };

                } catch {
                    // If error status code isn't FSPIOP conforming, create generic
                    // FSPIOP error and include backend code and message in FSPIOP message.
                    error = new ErrorHandling.Factory.FSPIOPError(
                        transfer.errorResponse.message,
                        `${transfer.errorResponse.statusCode} - ${transfer.errorResponse.message}`,
                        null,
                        Errors.MojaloopApiErrorCodes.CLIENT_ERROR,
                        null,
                        true
                    );
                }

                externalTransfer = {
                    transferId: transfer.transferId,
                    errorInformation: error.toApiErrorObject().errorInformation,
                };
            } else {
                externalTransfer = {
                    transferId: transfer.transferId,
                    fulfilment: fulfilments[transfer.transferId],
                    ...transfer.extensionList && {
                        extensionList: {
                            extension: transfer.extensionList,
                        },
                    }
                };
            }

            return externalTransfer;
        });
        external.individualTransferResults = individualTransferResults;
    }

    return external;
};

/**
 * Converts a mojaloop bulk transfer prepare request to internal form
 *
 * @returns {object}
 */
const mojaloopBulkPrepareToInternalBulkTransfer = (external, bulkQuotes, ilp) => {
    let internal = null;
    if (bulkQuotes) {
        // In order to pass on information not contained in an FSPIOP `IndividualTransfer` to
        // FSP backend, we create mappings that can resolve an internal quote from
        // the transfer id.

        // create a map of internal individual quotes indexed by quotedId, for faster lookup
        const internalQuotesByQuoteId = {};
        for (const quote of bulkQuotes.internalRequest.individualQuotes) {
            internalQuotesByQuoteId[quote.quoteId] = quote;
        }

        // create a map of quoted ids indexed by individual transfers id, for faster lookup
        const externalQuoteIdByTransferIds = {};

        for (const transfer of external.individualTransfers) {
            const transactionObject = ilp.getTransactionObject(transfer.ilpPacket);
            externalQuoteIdByTransferIds[transfer.transferId] = transactionObject.quoteId;
        }

        internal = {
            bulkTransferId: external.bulkTransferId,
            bulkQuotes: bulkQuotes.response,
            from: bulkQuotes.internalRequest.from,
        };

        internal.individualTransfers = external.individualTransfers.map((transfer) => {
            const internalQuote = internalQuotesByQuoteId[externalQuoteIdByTransferIds[transfer.transferId]];
            return {
                transferId: transfer.transferId,
                currency: transfer.transferAmount.currency,
                amount: transfer.transferAmount.amount,
                to: internalQuote.to,
                amountType: internalQuote.amountType,
                transactionType: internalQuote.transactionType,
                subScenario: internalQuote.subScenario,
                note: internalQuote.note
            };
        });
    } else {
        internal = {
            bulkTransferId: external.bulkTransferId,
            individualTransfers: external.individualTransfers.map((transfer) => ({
                transferId: transfer.transferId,
                currency: transfer.transferAmount.currency,
                amount: transfer.transferAmount.amount,
            }))
        };
    }

    return internal;
};

/**
 * Projects a Mojaloop API spec bulk transfer response to internal form
 *
 * @returns {object} - the internal form bulk transfer response
 */
const mojaloopBulkTransfersResponseToInternal = (external) => {
    const internal = {
        bulkTransferId: external.bulkTransferId
    };

    if (external.homeTransactionId) {
        internal.homeTransactionId = external.homeTransactionId;
    }

    if (external.bulkTransfersResponse?.bulkTransferState) {
        internal.bulkTransferState = external.bulkTransfersResponse.bulkTransferState;
    }

    if (external.bulkTransfersResponse?.completedTimestamp) {
        internal.completedTimestamp = external.bulkTransfersResponse.completedTimestamp;
    }

    if (external.bulkTransfersResponse?.extensionList) {
        internal.extensionList = external.bulkTransfersResponse.extensionList;
    }

    const individualTransferResults = external.bulkTransfersResponse?.individualTransferResults?.map((transfer) => {
        let internalTransfer = {
            ...transfer
        };
        delete internalTransfer.errorInformation;

        if(transfer.errorInformation) {
            internalTransfer.lastError = {
                mojaloopError: {
                    errorInformation: transfer.errorInformation
                }
            };
        }
        return internalTransfer;
    });

    internal.individualTransferResults = individualTransferResults;

    return internal;
};

/**
 * Converts a Mojaloop FX quote request to internal formProjects a Mojaloop API spec bulk transfer response to internal form
 *
 * @returns {object} - the internal form bulk transfer response
 */
const mojaloopFxQuoteRequestToInternal = (external) => {
    // perform payload reformatting here (if needed)
    return external;
};

const internalFxQuoteResponseToMojaloop = (beResponse) => {
    // eslint-disable-next-line no-unused-vars
    const { homeTransactionId, ...mlResponse } = beResponse;
    return mlResponse;
};

const mojaloopFxTransferPrepareToInternal = (external, fxQuote) => {
    const { homeTransactionId } = fxQuote.response;
    return {
        ...external,
        homeTransactionId,
    };
};

const internalFxTransferResponseToMojaloop = (beResponse, fulfilment) => {
    return {
        conversionState: beResponse.conversionState,
        fulfilment: beResponse.fulfilment || fulfilment,
        completedTimestamp: beResponse.completedTimestamp || new Date(),
        ...beResponse.extensionList && {
            extensionList: {
                extension: beResponse.extensionList,
            },
        },
    };
};

const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'host', // without removing host header request proxy fails with error: "Client network socket disconnected before secure TLS connection was established"
    'content-length', // without removing content-length header request just stuck
    'accept-encoding',
    'user-agent',
];

const hopByHopHeaders = [
    'connection',
    'proxy-connection',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'keep-alive',
];

const xHeaders = [
    'x-forwarded-proto',
    'x-request-id',
    'x-envoy-attempt-count',
    'x-forwarded-for',
    'x-forwarded-client-cert',
    'x-envoy-external-address',
    'x-envoy-decorator-operation',
    'x-envoy-peer-metadata',
    'x-envoy-peer-metadata-id',
    'x-b3-traceid',
    'x-b3-spanid',
    'x-b3-parentspanid',
    'x-b3-sampled',
];

module.exports = {
    internalPartyToMojaloopParty,
    internalQuoteResponseToMojaloop,
    internalTransactionRequestResponseToMojaloop,
    mojaloopPartyToInternalParty,
    mojaloopPartyIdInfoToInternalPartyIdInfo,
    mojaloopQuoteRequestToInternal,
    mojaloopPrepareToInternalTransfer,
    mojaloopTransactionRequestToInternal,
    mojaloopBulkQuotesRequestToInternal,
    mojaloopBulkQuotesResponseToInternal,
    internalBulkQuotesResponseToMojaloop,
    mojaloopBulkPrepareToInternalBulkTransfer,
    mojaloopBulkTransfersResponseToInternal,
    internalBulkTransfersResponseToMojaloop,
    mojaloopPutTransactionRequestToInternal,

    mojaloopFxQuoteRequestToInternal,
    mojaloopFxTransferPrepareToInternal,
    internalFxQuoteResponseToMojaloop,
    internalFxTransferResponseToMojaloop,
    sensitiveHeaders,
    hopByHopHeaders,
    xHeaders
};
