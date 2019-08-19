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
    let party = {
        partyIdInfo: {
            partyIdType: internal.idType,
            partyIdentifier: internal.idValue,
            fspId: fspId
        }
    };

    let hasComplexName = (internal.firstName || internal.middleName || internal.lastName) ? true : false;

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

        // Note: we dont map fspid to internal transferParty object
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
 * Converts a mojaloop transfer prepare request to internal form
 *
 * @returns {object}
 */
const mojaloopPrepareToInternalTransfer = (external, quote) => {
    const internal = {
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

    return internal;
};


module.exports = {
    internalPartyToMojaloopParty: internalPartyToMojaloopParty,
    mojaloopPartyToInternalParty: mojaloopPartyToInternalParty,
    mojaloopQuoteRequestToInternal: mojaloopQuoteRequestToInternal,
    internalQuoteResponseToMojaloop: internalQuoteResponseToMojaloop,
    mojaloopPrepareToInternalTransfer: mojaloopPrepareToInternalTransfer
};
