/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const { Errors } = require('@mojaloop/sdk-standard-components');
const FSPIOPBulkTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.BulkTransferState;


/**
 * Build a quote party object from an outgoing transfer API party
 *
 * @returns {object} - the constructed party object
 */
const internalPartyToMojaloopParty = (internal, fspId) => {
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
        to: mojaloopPartyToInternalParty(external.payee),
        from: mojaloopPartyToInternalParty(external.payer),
        amountType: external.amountType,
        amount: external.amount.amount,
        currency: external.amount.currency,
        transactionType: external.transactionType.scenario,
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
        internal.extensionList = external.extensionList;
    }

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
        external.extensionList = internal.extensionList;
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
const mojaloopPrepareToInternalTransfer = (external, quote, ilp) => {
    let internal = null;
    if(quote) {
        internal = {
            transferId: external.transferId,
            quote: quote.response,
            from: quote.internalRequest.from,
            to: quote.internalRequest.to,
            amountType: quote.request.amountType,
            currency: quote.request.amount.currency,
            amount: quote.request.amount.amount,
            transactionType: quote.request.transactionType.scenario,
            ilpPacket: {
                data: ilp.getTransactionObject(external.ilpPacket),
            },
            note: quote.request.note
        };
        if (quote.internalRequest && quote.internalRequest.extensionList && quote.internalRequest.extensionList.extension) {
            internal.quoteRequestExtensions = { ...quote.internalRequest.extensionList.extension };
        }
    } else {
        internal = {
            transferId: external.transferId,
            currency: external.amount.currency,
            amount: external.amount.amount,
        };
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
        initiator: external.transactionType.initiator,
        initiatorType: external.transactionType.initiatorType
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
            initiator: quote.transactionType.initiator,
            initiatorType: quote.transactionType.initiatorType
        };

        if (quote.fees) {
            internal.feesAmount = quote.fees.amount;
            internal.feesCurrency = quote.fees.currency;
        }

        if (quote.geoCode) {
            internal.geoCode = quote.geoCode;
        }

        if (quote.note) {
            internal.note = quote.note;
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
        // How do we map fsp backend errors to mojaloop errors?
        // For now we will map any error returned by the backend as a
        // mojaloop payee rejection and put the fsp backend error into an extension
        // list.
        if(quote.errorResponse) {
            externalQuote = {
                quoteId: quote.quoteId,
                errorInformation: Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.PAYEE_REJECTION).errorInformation,
                extensionList: {
                    extension: [
                        {
                            key: 'errorResponseStatusCode',
                            value: quote.errorResponse.statusCode
                        },
                        {
                            key: 'errorResponseMessage',
                            value: quote.errorResponse.message
                        },
                    ]
                }
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
            // How do we map fsp backend errors to mojaloop errors?
            // For now we will map any error returned by the backend as a
            // mojaloop payee rejection and put the fsp backend error into an extension
            // list.
            if(transfer.errorResponse) {
                externalTransfer = {
                    transferId: transfer.transferId,
                    errorInformation: Errors.MojaloopApiErrorObjectFromCode(Errors.MojaloopApiErrorCodes.PAYEE_REJECTION).errorInformation,
                    extensionList: {
                        extension: [
                            {
                                key: 'errorResponseStatusCode',
                                value: transfer.errorResponse.statusCode
                            },
                            {
                                key: 'errorResponseMessage',
                                value: transfer.errorResponse.message
                            },
                        ]
                    }
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
        // create a map of internal individual quotes payees indexed by quotedId, for faster lookup
        const internalQuotesPayeesByQuoteId = {};

        for (const quote of bulkQuotes.internalRequest.individualQuotes) {
            internalQuotesPayeesByQuoteId[quote.quoteId] = quote.to;
        }

        // create a map of external individual transfers indexed by quotedId, for faster lookup
        const externalTransferIdsByQuoteId = {};

        for (const transfer of external.individualTransfers) {
            const transactionObject = ilp.getTransactionObject(transfer.ilpPacket);
            externalTransferIdsByQuoteId[transactionObject.quoteId] = transfer.transferId;
        }

        internal = {
            bulkTransferId: external.bulkTransferId,
            bulkQuotes: bulkQuotes.response,
            from: bulkQuotes.internalRequest.from,
        };

        internal.individualTransfers = bulkQuotes.request.individualQuotes.map((quote) => ({
            transferId: externalTransferIdsByQuoteId[quote.quoteId],
            to: internalQuotesPayeesByQuoteId[quote.quoteId],
            amountType: quote.amountType,
            currency: quote.amount.currency,
            amount: quote.amount.amount,
            transactionType: quote.transactionType.scenario,
            note: quote.note
        }));
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
    internalBulkTransfersResponseToMojaloop
};
