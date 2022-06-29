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
    IIdType,
    IFspId,
    IExtensionList,
    IPartyComplexName,
    IDateShort,
    IBulkTransferEntity  // TODO: TBD mbp-638
} from "@mojaloop/sdk-scheme-adapater-private-types";
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
    InvalidBulkTransferEntityBulkQuotesFailCountTypeError,
    InvalidBulkTransferEntityBulkTransfersTotalCountTypeError,
    InvalidBulkTransferEntityBulkTransfersSuccessCountTypeError,
    InvalidBulkTransferEntityBulkTransfersFailCountTypeError
} from "./errors";

export class BulkTransferEntity implements IBulkTransferEntity {
    id: string;
    bulkHomeTransactionID: string | null;
    request: BulkTransferRequest;
    individualtransfers: IndividualTransfers;
    status: BulkTransferStatus;
    bulkBatch: BulkBatch;
    partyLookupTotalCount: number;
    partyLookupSuccessCount: number;
    partyLookupFailedCount: number;
    bulkQuotesTotalCount: number;
    bulkQuotesSuccessCount: number;
    bulkQuotesFailedCount: number;
    bulkTransfersTotalCount: number;
    bulkTransfersSuccessCount: number;
    bulkTransfersFailedCount: number;

    constructor(
        id: string,
        bulkHomeTransactionID: string | null,
        request: BulkTransferRequest,
        individualtransfers: IndividualTransfers,
        status: BulkTransferStatus,
        bulkBatch: BulkBatch,
        partyLookupTotalCount: number,
        partyLookupSuccessCount: number,
        partyLookupFailedCount: number,
        bulkQuotesTotalCount: number,
        bulkQuotesSuccessCount: number,
        bulkQuotesFailedCount: number,
        bulkTransfersTotalCount: number,
        bulkTransfersSuccessCount: number,
        bulkTransfersFailedCount: number
    ) {
        this.id = id;
        this.bulkHomeTransactionID = bulkHomeTransactionID;
        this.request = request;
        this.individualtransfers = individualtransfers;
        this.status = status;
        this.bulkBatch = bulkBatch;
        this.partyLookupTotalCount = partyLookupTotalCount;
        this.partyLookupSuccessCount = partyLookupSuccessCount;
        this.partyLookupFailedCount = partyLookupFailedCount;
        this.bulkQuotesTotalCount = bulkQuotesTotalCount;
        this.bulkQuotesSuccessCount = bulkQuotesSuccessCount;
        this.bulkQuotesFailedCount = bulkQuotesFailedCount;
        this.bulkTransfersTotalCount = bulkTransfersTotalCount;
        this.bulkTransfersSuccessCount = bulkTransfersSuccessCount;
        this.bulkTransfersFailedCount = bulkTransfersFailedCount;
    }

    static validatebulkTransferEntity(bulkTransferEntity: IBulkTransferEntity): void { // TODO: BulkTransferEntity or IBulkTransferEntity?
        // id.
        if (typeof bulkTransferEntity.id !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // bulkHomeTransactionID.
        if (typeof bulkTransferEntity.bulkHomeTransactionID !== "string"
            && bulkTransferEntity.bulkHomeTransactionID !== null) {
            throw new InvalidExtIdTypeError();
        }
        // request.
        if (typeof bulkTransferEntity.request !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
        if (!(bulkTransferEntity.request in AccountType)) {
            throw new InvalidAccountTypeError();
        }
        // individualtransfers.
        if (typeof bulkTransferEntity.individualtransfers !== "string") {
            throw new InvalidCurrencyTypeError();
        }
        // status.
        if (typeof bulkTransferEntity.status !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        if (!(bulkTransferEntity.status in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // bulkBatch.
        if (typeof bulkTransferEntity.bulkBatch !== "number") { // TODO: bigint.
            throw new InvalidCreditBalanceTypeError();
        }
        // partyLookupTotalCount.
        if (typeof bulkTransferEntity.partyLookupTotalCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.partyLookupTotalCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // partyLookupSuccessCount.
        if (typeof bulkTransferEntity.partyLookupSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.partyLookupSuccessCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // partyLookupFailedCount.
        if (typeof bulkTransferEntity.partyLookupFailedCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.partyLookupFailedCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkQuotesTotalCount.
        if (typeof bulkTransferEntity.bulkQuotesTotalCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkQuotesTotalCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkQuotesSuccessCount.
        if (typeof bulkTransferEntity.bulkQuotesSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkQuotesSuccessCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkQuotesFailedCount.
        if (typeof bulkTransferEntity.bulkQuotesFailedCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkQuotesFailedCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkTransfersTotalCount.
        if (typeof bulkTransferEntity.bulkTransfersTotalCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkTransfersTotalCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkTransfersSuccessCount.
        if (typeof bulkTransferEntity.bulkTransfersSuccessCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkTransfersSuccessCount < 0) {
            throw new InvalidDebitBalanceError();
        }
        // bulkTransfersFailedCount.
        if (typeof bulkTransferEntity.bulkTransfersFailedCount !== "number") { // TODO: bigint.
            throw new InvalidDebitBalanceTypeError();
        }
        if (bulkTransferEntity.bulkTransfersFailedCount < 0) {
            throw new InvalidDebitBalanceError();
        }

    }
}
 }

export class BulkTransferRequest implements IBulkTransferRequest {
    options: BulkTransferOptions;
    extensionList: BulkExtensionList;

    constructor(
        options: BulkTransferOptions,
        extensionList: BulkExtensionList
    ) {
        this.options = options;
        this.extensionList = extensionList;
    }

    static validateBulkTransferRequest(bulkTransferRequest: IBulkTransferRequest): void {
        // options.
        if (typeof bulkTransferRequest.options !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // extensionList.
        if (typeof bulkTransferRequest.extensionList !== "string"
            && bulkTransferRequest.extensionList !== null) {
            throw new InvalidExtIdTypeError();
        }
    }
}

export class IndividualTransfers implements IIndividualTransfers {
    id: string;
    request: BulkTransferRequest;
    status: BulkTransferStatus;
    batchId: string;
    partyRequest: PartyRequest; // TODO verify
    partyResponse: PartyRequest; // TODO Define Party Response...once we have identified what it should be
    acceptParty: boolean;
    acceptQuote: boolean;

    constructor(
        id: string,
        request: IBulkTransferRequest,
        status: BulkTransferStatus,
        batchId: string,
        partyRequest: PartyRequest,
        partyResponse: PartyRequest,
        acceptParty: boolean,
        acceptQuote: boolean
    ) {
        this.id = id;
        this.request = request;
        this.status = status;
        this.batchId = batchId;
        this.partyRequest = partyRequest; // TODO verify
        this.partyResponse = partyResponse; // TODO Define Party Response...once we have identified what it should be
        this.acceptParty = acceptParty;
        this.acceptQuote = acceptQuote;
    }

    static validateIndividualTransfers(individualTransfers: IIndividualTransfers): void {
        // id.
        if (typeof individualTransfers.id !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // request.
        if (typeof individualTransfers.request !== "string"
            && individualTransfers.request !== null) {
            throw new InvalidExtIdTypeError();
        }
        // status.
        if (typeof individualTransfers.status !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        if (!(individualTransfers.status in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // batchId.
        if (typeof individualTransfers.batchId !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
        // partyRequest.
        if (typeof individualTransfers.partyRequest !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
        // partyResponse.
        if (typeof individualTransfers.partyResponse !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
        // acceptParty.
        if (typeof individualTransfers.acceptParty !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
        // acceptQuote.
        if (typeof individualTransfers.acceptQuote !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
    }
}

export class BulkTransferStatus implements IBulkTransferStatus {
    status: string;

    constructor(
        status: string
    ) {
        this.status = status;
    }

    static validateBulkTransferStatus(bulkTransferStatus: IBulkTransferStatus): void {
        // status.
        if (typeof bulkTransferStatus.status !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class BulkBatch implements IBulkBatch {
    id: string;
    status: BulkTransferStatus;
    bulkQuoteId: string;
    bulkTransferId: string;

    constructor(
        id: string,
        status: BulkTransferStatus,
        bulkQuoteId: string,
        bulkTransferId: string
    ) {
        this.id = id;
        this.status = status;
        this.bulkQuoteId = bulkQuoteId;
        this.bulkTransferId = bulkTransferId;
    }

    static validateBulkBatch(bulkBatch: IBulkBatch): void {
        // id.
        if (typeof bulkBatch.id !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // status.
        if (typeof bulkBatch.status !== "string"
            && bulkBatch.extId !== null) {
            throw new InvalidExtIdTypeError();
        }
        // bulkQuoteId.
        if (typeof bulkBatch.bulkQuoteId !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        if (!(bulkBatch.bulkQuoteId in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // bulkTransferId.
        if (typeof bulkBatch.bulkTransferId !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
    }
}

export class BulkTransferOptions implements IBulkTransferOptions {
    onlyValidateParty: boolean;
    autoAcceptParty: AutoAcceptPartyOption;
    autoAcceptQuote: AutoAcceptQuoteOption;
    skipPartyLookup: boolean;
    synchronous: boolean;

    constructor(
        onlyValidateParty: boolean,
        autoAcceptParty: AutoAcceptPartyOption,
        autoAcceptQuote: AutoAcceptQuoteOption,
        skipPartyLookup: boolean,
        synchronous: boolean
    ) {
        this.onlyValidateParty = onlyValidateParty;
        this.autoAcceptParty = autoAcceptParty;
        this.autoAcceptQuote = autoAcceptQuote;
        this.skipPartyLookup = skipPartyLookup;
        this.synchronous = synchronous;
    }

    static validateBulkTransferOptions(bulkTransferOptions: IBulkTransferOptions): void {
        // onlyValidateParty.
        if (typeof bulkTransferOptions.onlyValidateParty !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // autoAcceptParty.
        if (typeof bulkTransferOptions.autoAcceptParty !== "string"
            && bulkBbulkTransferOptionsatch.autoAcceptParty !== null) {
            throw new InvalidExtIdTypeError();
        }
        // autoAcceptQuote.
        if (typeof bulkTransferOptions.autoAcceptQuote !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        // skipPartyLookup.
        if (!(bulkTransferOptions.skipPartyLookup in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // synchronous.
        if (typeof bulkTransferOptions.synchronous !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
    }
}

export class BulkExtensionList implements IBulkExtensionList {
    items: Array<ExtensionItem>;

    constructor(
        items: Array<ExtensionItem>
    ) {
        this.items = items;
    }

    static validateBulkExtensionList(bulkExtensionList: IBulkExtensionList): void {
        // items.
        if (typeof bulkExtensionList.items !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class ExtensionItem implements IExtensionItem {
    key: string;
    value: string;

    constructor(
        key: string,
        value: string
    ) {
        this.key = key;
        this.value = value;
    }

    static validateExtensionItem(extensionItem: IExtensionItem): void {
        // key.
        if (typeof extensionItem.key !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // value.
        if (typeof extensionItem.value !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class PartyRequest implements IPartyRequest {
    partyIdInfo: PartyIdInfo;
    merchantClassificationCode: MerchantClassificationCode;
    name: PartyName;
    personalInfo: PersonalInfo;

    constructor(
        partyIdInfo: PartyIdInfo,
        merchantClassificationCode: MerchantClassificationCode,
        name: PartyName,
        personalInfo: PersonalInfo
    ) {
        this.partyIdInfo = partyIdInfo;
        this.merchantClassificationCode = merchantClassificationCode;
        this.name = name;
        this.personalInfo = personalInfo;
    }

    static validatePartyRequest(partyRequest: IPartyRequest): void {
        // partyIdInfo.
        if (typeof partyRequest.partyIdInfo !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // merchantClassificationCode.
        if (typeof partyRequest.merchantClassificationCode !== "string"
            && partyRequest.merchantClassificationCode !== null) {
            throw new InvalidExtIdTypeError();
        }
        // name.
        if (typeof partyRequest.name !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        if (!(partyRequest.name in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // personalInfo.
        if (typeof partyRequest.personalInfo !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
    }
}

export class AutoAcceptPartyOption implements IAutoAcceptPartyOption {
    enabled: boolean;

    constructor(
        enabled: boolean
    ) {
        this.enabled = enabled;
    }

    static validateAutoAcceptPartyOption(autoAcceptPartyOption: IAutoAcceptPartyOption): void {
        // enabled.
        if (typeof autoAcceptPartyOption.enabled !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class AutoAcceptQuoteOption implements IAutoAcceptQuoteOption {
    enabled: boolean;
    perTransferFeeLimits: BulkPerTransferFeeLimit;

    constructor(
        enabled: boolean,
        perTransferFeeLimits: BulkPerTransferFeeLimit;
    ) {
        this.enabled = enabled;
        this.perTransferFeeLimits = perTransferFeeLimits;
    }

    static validateAutoAcceptQuoteOption(autoAcceptQuoteOption: IAutoAcceptQuoteOption): void {
        // enabled.
        if (typeof autoAutoAcceptQuoteOption.enabled !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // perTransferFeeLimits.
        if (typeof autoAutoAcceptQuoteOption.perTransferFeeLimits !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class PartyIdInfo implements IPartyIdInfo {
    partyIdType: IdType;
    partyIdentifier: string;
    partySubIdOrType: string;
    fspId: FspId;
    extensionList: ExtensionList;

    constructor(
        partyIdType: IdType,
        partyIdentifier: string,
        partySubIdOrType: string,
        fspId: FspId,
        extensionList: ExtensionList
    ) {
        this.partyIdType = partyIdType;
        this.partyIdentifier = partyIdentifier;
        this.partySubIdOrType = partySubIdOrType;
        this.fspId = fspId;
        this.extensionList = extensionList;
    }

    static validatePartyRequest(partyRequest: IPartyRequest): void {
        // partyIdType.
        if (typeof partyRequest.partyIdType !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // partyIdentifier.
        if (typeof partyRequest.partyIdentifier !== "string"
            && partyRequest.extId !== null) {
            throw new InvalidExtIdTypeError();
        }
        // partySubIdOrType.
        if (typeof partyRequest.partySubIdOrType !== "string") {
            throw new InvalidAccountStateTypeError();
        }
        // fspId.
        if (!(partyRequest.fspId in AccountState)) {
            throw new InvalidAccountStateError();
        }
        // extensionList.
        if (typeof partyRequest.extensionList !== "string") {
            throw new InvalidAccountTypeTypeError();
        }
    }
}

export class MerchantClassificationCode implements IMerchantClassificationCode {
    merchantClassificationCode: string;

    constructor(
        merchantClassificationCode: string
    ) {
        this.merchantClassificationCode = merchantClassificationCode;
    }

    static validateMerchantClassificationCode(merchantClassificationCode: IMerchantClassificationCode): void {
        // merchantClassificationCode.
        if (typeof merchantClassificationCode.merchantClassificationCode !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class PartyName implements IPartyName {
    partyName: string;

    constructor(
        partyName: string
    ) {
        this.partyName = partyName;
    }

    static validatePartyName(partyName: IPartyName): void {
        // partyName.
        if (typeof partyName.partyName !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class PersonalInfo implements IPersonalInfo {
    complexName: PartyComplexName;
    dateOfBirth: DateShort;

    constructor(
        complexName: PartyComplexName,
        dateOfBirth: DateShort
    ) {
        this.complexName = complexName;
        this.dateOfBirth = dateOfBirth;
    }

    static validatePersonalInfo(personalInfo: IPersonalInfo): void {
        // complexName.
        if (typeof personalInfo.complexName !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // dateOfBirth.        
        if (typeof personalInfo.dateOfBirth !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class PartyComplexName implements IPartyComplexName {
    firstName: PartyName;
    middleName: PartyName;
    lastName: PartyName;

    constructor(
        firstName: PartyName,
        middleName: PartyName,
        lastName: PartyName
    ) {
        this.firstName = firstName;
        this.middleName = middleName;
        this.lastName = lastName;
    }

    static validatePartyComplexName(partyComplexName: IPartyComplexName): void {
        // firstName.
        if (typeof partyComplexName.firstName !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // firstName.        
        if (typeof partyComplexName.middleName !== "string") {
            throw new InvalidAccountIdTypeError();
        }
        // lastName.        
        if (typeof partyComplexName.lastName !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}

export class ExtensionList implements IExtensionList {
    items: Array<ExtensionItem>;

    constructor(
        items: Array<ExtensionItem>
    ) {
        this.items = items;
    }

    static validateExtensionList(extensionList: IExtensionList): void {
        // items.
        if (typeof extensionList.items !== "string") {
            throw new InvalidAccountIdTypeError();
        }
    }
}


export class IdType implements IIdType {
    idType: string;

    constructor(
        idType: string
    ) {
        this.idType = idType;
    }

    static validateIdType(idType: IIdType): void {
        // idType.
        if (typeof idType.idType !== "string") {
            throw new InvalidIdTypeTypeError();
        }
    }
}

export class FspId implements IFspId {
    fspId: string;

    constructor(
        fspId: string
    ) {
        this.fspId = fspId;
    }

    static validateFspId(fspId: IFspId): void {
        // fspId.
        if (typeof fspId.fspId !== "string") {
            throw new InvalidFspIdTypeError();
        }
    }
}

export class DateShort implements IDateShort {
    dateShort: string;

    constructor(
        dateShort: string
    ) {
        this.dateShort = dateShort;
    }

    static validateDateShort(dateShort: IDateShort): void {
        // dateShort.
        if (typeof dateShort.dateShort !== "string") {
            throw new InvalidDateShortTypeError();
        }
    }
}