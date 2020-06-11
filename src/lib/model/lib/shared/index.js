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

    if (internal.accounts) {
        party.accounts = {
            account: internal.accounts
        };
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
        // Note: we dont map fspid to internal transferParty object
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

    if(external.accounts){
        internal.accounts = external.accounts.account;
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
const mojaloopPrepareToInternalTransfer = (external, quote) => {
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
            note: quote.request.note
        };
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


module.exports = {
    internalPartyToMojaloopParty,
    internalQuoteResponseToMojaloop,
    internalTransactionRequestResponseToMojaloop,
    mojaloopPartyToInternalParty,
    mojaloopPartyIdInfoToInternalPartyIdInfo,
    mojaloopQuoteRequestToInternal,
    mojaloopPrepareToInternalTransfer,
    mojaloopTransactionRequestToInternal
};
