/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 * Modusbox
 - Shashikant Hirugade <shashikant.hirugade@modusbox.com>
 - Juan Correa <juancorrea@modusbox.com>

 --------------
 ******/

"use strict";

import {
    IBulkTransferRequest,  // TODO: TBD
    IIndividualTransfers, // TODO: TBD
    IBulkTransferStatus,
    IBulkBatch,  // TODO: TBD
    IBulkTransferOptions,
    IBulkExtensionList,
    IExtensionItem,
    IPartyRequest,
    IAutoAcceptPartyOption,
    IAutoAcceptQuoteOption,
    IPartyIdInfo,
    IMerchantClassificationCode,
    IPartyName,
    IPersonalInfo,
    IdType,
    IFspId,
    IExtensionList,
    IPartyComplexName,
    IDateShort,
    IBulkPerTransferFeeLimit,
    IBulkTransactionEntity  // TODO: TBD mbp-638
} from "@mojaloop/sdk-scheme-adapter-public-shared-lib";
import {
    InvalidBulkTransferEntityIdTypeError,
    InvalidBulkTransferEntityHomeTransactionIDTypeError,
    InvalidBulkTransferEntityRequestTypeError,
    InvalidBulkTransferEntityIndividualTransfersTypeError,
    InvalidBulkTransferEntityStatusTypeError,
    InvalidBulkTransferEntityBulkBatchTypeError,
    InvalidBulkTransferEntityPartyLookupTotalCountTypeError,
    InvalidBulkTransferEntityPartyLookupSuccessCountTypeError,
    InvalidBulkTransferEntityPartyLookupFailedCountTypeError,
    InvalidBulkTransferEntityBulkQuotesTotalCountTypeError,
    InvalidBulkTransferEntityBulkQuotesSuccessCountTypeError,
    InvalidBulkTransferEntityBulkQuotesFailCountTypeError,
    InvalidBulkTransferEntityBulkTransfersTotalCountTypeError,
    InvalidBulkTransferEntityBulkTransfersSuccessCountTypeError,
    InvalidBulkTransferEntityBulkTransfersFailCountTypeError
} from "./errors";

// const t = new BulkTransferEntity({id: "", bulkHomeTransactionID:""});
export class BulkTransactionEntity implements IBulkTransactionEntity {
    id: string;
    bulkHomeTransactionID: string | null;
    request: IBulkTransferRequest;
    individualtransfers: IIndividualTransfers;
    status: IBulkTransferStatus;
    bulkBatch: IBulkBatch;
    partyLookupTotalCount: number;
    partyLookupSuccessCount: number;
    partyLookupFailedCount: number;
    bulkQuotesTotalCount: number;
    bulkQuotesSuccessCount: number;
    bulkQuotesFailedCount: number;
    bulkTransfersTotalCount: number;
    bulkTransfersSuccessCount: number;
    bulkTransfersFailedCount: number;

    // JODO: update all constructors to receive the interface...so it is defined as a type
    constructor(
        bulkTransactionEntity: IBulkTransactionEntity
    ) {
        this.id = bulkTransactionEntity.id;
        this.bulkHomeTransactionID = bulkTransactionEntity.bulkHomeTransactionID;
        this.request = bulkTransactionEntity.request;
        this.individualtransfers = bulkTransactionEntity.individualtransfers;
        this.status = bulkTransactionEntity.status;
        this.bulkBatch = bulkTransactionEntity.bulkBatch;
        this.partyLookupTotalCount = bulkTransactionEntity.partyLookupTotalCount;
        this.partyLookupSuccessCount = bulkTransactionEntity.partyLookupSuccessCount;
        this.partyLookupFailedCount = bulkTransactionEntity.partyLookupFailedCount;
        this.bulkQuotesTotalCount = bulkTransactionEntity.bulkQuotesTotalCount;
        this.bulkQuotesSuccessCount = bulkTransactionEntity.bulkQuotesSuccessCount;
        this.bulkQuotesFailedCount = bulkTransactionEntity.bulkQuotesFailedCount;
        this.bulkTransfersTotalCount = bulkTransactionEntity.bulkTransfersTotalCount;
        this.bulkTransfersSuccessCount = bulkTransactionEntity.bulkTransfersSuccessCount;
        this.bulkTransfersFailedCount = bulkTransactionEntity.bulkTransfersFailedCount;
    }

    static validatebulkTransactionEntity(bulkTransactionEntity: IBulkTransactionEntity): void {
        // id.
        if (typeof bulkTransactionEntity.id !== "string") {
            throw new InvalidBulkTransferEntityIdTypeError();
        }
        // bulkHomeTransactionID.
        if (typeof bulkTransactionEntity.bulkHomeTransactionID !== "string"
            && bulkTransactionEntity.bulkHomeTransactionID !== null) {
            throw new InvalidBulkTransferEntityHomeTransactionIDTypeError();
        }
        // request.
        if (typeof bulkTransactionEntity.request !== "string") {
            throw new InvalidBulkTransferEntityRequestTypeError();
        }
        // individualtransfers.
        if (typeof bulkTransactionEntity.individualtransfers !== "string") {
            throw new InvalidBulkTransferEntityIndividualTransfersTypeError();
        }
        // status.
        if (typeof bulkTransactionEntity.status !== "string") {
            throw new InvalidBulkTransferEntityStatusTypeError();
        }
        if (!(bulkTransactionEntity.status in IBulkTransferStatus)) {
            throw new InvalidBulkTransferEntityStatusTypeError();
        }
        // bulkBatch.
        if (typeof bulkTransactionEntity.bulkBatch !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkBatchTypeError();
        }
        // partyLookupTotalCount.
        if (typeof bulkTransactionEntity.partyLookupTotalCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityPartyLookupTotalCountTypeError();
        }
        if (bulkTransactionEntity.partyLookupTotalCount < 0) {
            throw new InvalidBulkTransferEntityPartyLookupTotalCountTypeError();
        }
        // partyLookupSuccessCount.
        if (typeof bulkTransactionEntity.partyLookupSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityPartyLookupSuccessCountTypeError();
        }
        if (bulkTransactionEntity.partyLookupSuccessCount < 0) {
            throw new InvalidBulkTransferEntityPartyLookupSuccessCountTypeError();
        }
        // partyLookupFailedCount.
        if (typeof bulkTransactionEntity.partyLookupFailedCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityPartyLookupFailedCountTypeError();
        }
        if (bulkTransactionEntity.partyLookupFailedCount < 0) {
            throw new InvalidBulkTransferEntityPartyLookupFailedCountTypeError();
        }
        // bulkQuotesTotalCount.
        if (typeof bulkTransactionEntity.bulkQuotesTotalCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkQuotesTotalCountTypeError();
        }
        if (bulkTransactionEntity.bulkQuotesTotalCount < 0) {
            throw new InvalidBulkTransferEntityBulkQuotesTotalCountTypeError();
        }
        // bulkQuotesSuccessCount.
        if (typeof bulkTransactionEntity.bulkQuotesSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkQuotesSuccessCountTypeError();
        }
        if (bulkTransactionEntity.bulkQuotesSuccessCount < 0) {
            throw new InvalidBulkTransferEntityBulkQuotesSuccessCountTypeError();
        }
        // bulkQuotesFailedCount.
        if (typeof bulkTransactionEntity.bulkQuotesFailedCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkQuotesFailCountTypeError();
        }
        if (bulkTransactionEntity.bulkQuotesFailedCount < 0) {
            throw new InvalidBulkTransferEntityBulkQuotesFailCountTypeError();
        }
        // bulkTransfersTotalCount.
        if (typeof bulkTransactionEntity.bulkTransfersTotalCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkTransfersTotalCountTypeError();
        }
        if (bulkTransactionEntity.bulkTransfersTotalCount < 0) {
            throw new InvalidBulkTransferEntityBulkTransfersTotalCountTypeError();
        }
        // bulkTransfersSuccessCount.
        if (typeof bulkTransactionEntity.bulkTransfersSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkTransfersSuccessCountTypeError();
        }
        if (bulkTransactionEntity.bulkTransfersSuccessCount < 0) {
            throw new InvalidBulkTransferEntityBulkTransfersSuccessCountTypeError();
        }
        // bulkTransfersFailedCount.
        if (typeof bulkTransactionEntity.bulkTransfersFailedCount !== "number") { // TODO: bigint.
            throw new InvalidBulkTransferEntityBulkTransfersFailCountTypeError();
        }
        if (bulkTransactionEntity.bulkTransfersFailedCount < 0) {
            throw new InvalidBulkTransferEntityBulkTransfersFailCountTypeError();
        }

    }
}

export class BulkTransferRequest implements IBulkTransferRequest {
    options: IBulkTransferOptions;
    extensionList: IBulkExtensionList;

    constructor(
        bulkTransferRequest: IBulkTransferRequest
    ) {
        this.options = bulkTransferRequest.options;
        this.extensionList = bulkTransferRequest.extensionList;
    }

}

export class IndividualTransfers implements IIndividualTransfers {
    id: string;
    request: IBulkTransferRequest;
    status: IBulkTransferStatus;
    batchId: string;
    partyRequest: IPartyRequest; // TODO verify
    partyResponse: IPartyRequest; // TODO Define Party Response...once we have identified what it should be
    acceptParty: boolean;
    acceptQuote: boolean;

    constructor(
        individualTransfers: IIndividualTransfers
    ) {
        this.id = individualTransfers.id;
        this.request = individualTransfers.request;
        this.status = individualTransfers.status;
        this.batchId = individualTransfers.batchId;
        this.partyRequest = individualTransfers.partyRequest; // TODO verify
        this.partyResponse = individualTransfers.partyResponse; // TODO Define Party Response...once we have identified what it should be
        this.acceptParty = individualTransfers.acceptParty;
        this.acceptQuote = individualTransfers.acceptQuote;
    }
}

export class BulkTransferStatus implements IBulkTransferStatus {
    status: string;

    constructor(
        status: string
    ) {
        this.status = status;
    }
}

export class BulkBatch implements IBulkBatch {
    id: string;
    status: IBulkTransferStatus;
    bulkQuoteId: string;
    bulkTransferId: string;

    constructor(
        bulkBatch: IBulkBatch
    ) {
        this.id = bulkBatch.id;
        this.status = bulkBatch.status;
        this.bulkQuoteId = bulkBatch.bulkQuoteId;
        this.bulkTransferId = bulkBatch.bulkTransferId;
    }
}

export class BulkTransferOptions implements IBulkTransferOptions {
    onlyValidateParty: boolean;
    autoAcceptParty: IAutoAcceptPartyOption;
    autoAcceptQuote: IAutoAcceptQuoteOption;
    skipPartyLookup: boolean;
    synchronous: boolean;

    constructor(
        bulkTransferOptions: IBulkTransferOptions
    ) {
        this.onlyValidateParty = bulkTransferOptions.onlyValidateParty;
        this.autoAcceptParty = bulkTransferOptions.autoAcceptParty;
        this.autoAcceptQuote = bulkTransferOptions.autoAcceptQuote;
        this.skipPartyLookup = bulkTransferOptions.skipPartyLookup;
        this.synchronous = bulkTransferOptions.synchronous;
    }
}

export class BulkExtensionList implements IBulkExtensionList {
    items: Array<IExtensionItem>;

    constructor(
        items: Array<IExtensionItem>
    ) {
        this.items = items;
    }
}

export class ExtensionItem implements IExtensionItem {
    key: string;
    value: string;

    constructor(
        extensionItem: IExtensionItem
    ) {
        this.key = extensionItem.key;
        this.value = extensionItem.value;
    }
}

export class PartyRequest implements IPartyRequest {
    partyIdInfo: IPartyIdInfo;
    merchantClassificationCode: IMerchantClassificationCode;
    name: IPartyName;
    personalInfo: IPersonalInfo;

    constructor(
        partyRequest: IPartyRequest
    ) {
        this.partyIdInfo = partyRequest.partyIdInfo;
        this.merchantClassificationCode = partyRequest.merchantClassificationCode;
        this.name = partyRequest.name;
        this.personalInfo = partyRequest.personalInfo;
    }
}

export class AutoAcceptPartyOption implements IAutoAcceptPartyOption {
    enabled: boolean;

    constructor(
        enabled: boolean
    ) {
        this.enabled = enabled;
    }
}

export class AutoAcceptQuoteOption implements IAutoAcceptQuoteOption {
    enabled: boolean;
    perTransferFeeLimits: IBulkPerTransferFeeLimit;

    constructor(
        autoAcceptQuoteOption: IAutoAcceptQuoteOption
    ) {
        this.enabled = autoAcceptQuoteOption.enabled;
        this.perTransferFeeLimits = autoAcceptQuoteOption.perTransferFeeLimits;
    }
}

export class PartyIdInfo implements IPartyIdInfo {
    partyIdType: IIdType;
    partyIdentifier: string;
    partySubIdOrType: string;
    fspId: IFspId;
    extensionList: IExtensionList;

    constructor(
        partyIdInfo: IPartyIdInfo
    ) {
        this.partyIdType = partyIdInfo.partyIdType;
        this.partyIdentifier = partyIdInfo.partyIdentifier;
        this.partySubIdOrType = partyIdInfo.partySubIdOrType;
        this.fspId = partyIdInfo.fspId;
        this.extensionList = partyIdInfo.extensionList;
    }
}

export class MerchantClassificationCode implements IMerchantClassificationCode {
    merchantClassificationCode: string;

    constructor(
        merchantClassificationCode: string
    ) {
        this.merchantClassificationCode = merchantClassificationCode;
    }
}

export class PartyName implements IPartyName {
    partyName: string;

    constructor(
        partyName: string
    ) {
        this.partyName = partyName;
    }
}

export class PersonalInfo implements IPersonalInfo {
    complexName: IPartyComplexName;
    dateOfBirth: IDateShort;

    constructor(
        personalInfo: IPersonalInfo
    ) {
        this.complexName = personalInfo.complexName;
        this.dateOfBirth = personalInfo.dateOfBirth;
    }
}

export class PartyComplexName implements IPartyComplexName {
    firstName: IPartyName;
    middleName: IPartyName;
    lastName: IPartyName;

    constructor(
        partyComplexName: IPartyComplexName
    ) {
        this.firstName = partyComplexName.firstName;
        this.middleName = partyComplexName.middleName;
        this.lastName = partyComplexName.lastName;
    }
}

export class ExtensionList implements IExtensionList {
    items: Array<IExtensionItem>;

    constructor(
        items: Array<IExtensionItem>
    ) {
        this.items = items;
    }
}

export class IdType implements IdType {
    idType: string;

    constructor(
        idType: string
    ) {
        this.idType = idType;
    }
}

export class FspId implements IFspId {
    fspId: string;

    constructor(
        fspId: string
    ) {
        this.fspId = fspId;
    }
}

export class DateShort implements IDateShort {
    dateShort: string;

    constructor(
        dateShort: string
    ) {
        this.dateShort = dateShort;
    }
}