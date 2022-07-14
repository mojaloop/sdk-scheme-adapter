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

// TODO: why interfaces and not classes?

export interface BulkPerTransferFeeLimit {
	currency: Currency;
	amount: Money;
}

export interface IAutoAcceptPartyOption {
	enabled: boolean;
}

export interface IAutoAcceptQuoteOption {
	enabled: boolean;
	perTransferFeeLimits: BulkPerTransferFeeLimit;
}

export interface IBulkTransferOptions {
	onlyValidateParty: boolean;
	autoAcceptParty: IAutoAcceptPartyOption;
	autoAcceptQuote: IAutoAcceptQuoteOption;
	skipPartyLookup: boolean;
	synchronous: boolean;
}

export interface IExtensionItem {
	key: string;
	value: string;
}

export interface BulkExtensionList {
	items: Array<IExtensionItem>;
}

export interface IBulkTransferRequest {
	options: IBulkTransferOptions;
	extensionList: BulkExtensionList;
}

export interface IExtensionList {
	items: Array<IExtensionItem>;
}

export interface IFspId {
	fspId: string;
}

export interface IPartyIdInfo {
	partyIdType: IIdType;
	partyIdentifier: string;
	partySubIdOrType: string;
	fspId: IFspId;
	extensionList: IExtensionList;
}

export interface IMerchantClassificationCode {
	merchantClassificationCode: string;
}

export interface PartyName {
	partyName: string;
}


export interface IPartyComplexName {
	firstName: PartyName;
	middleName: PartyName;
	lastName: PartyName;
}

export interface IDateShort {
	dateShort: string;
}

export interface IPersonalInfo {
	complexName: IPartyComplexName;
	dateOfBirth: IDateShort;
}

// TODO verify
export interface IPartyRequest {
	partyIdInfo: IPartyIdInfo;
	merchantClassificationCode: IMerchantClassificationCode;
	name: PartyName;
	personalInfo: IPersonalInfo;
}

export interface IIndividualTransfers {
	id: string;
	request: IBulkTransferRequest;
	status: IBulkTransferStatus;
	batchId: string;
	partyRequest: IPartyRequest; // TODO verify
	partyResponse: IPartyRequest; // TODO Define Party Response...once we have identified what it should be
	acceptParty: boolean;
	acceptQuote: boolean;
}

export interface BulkBatch {
	id: string;
	status: IBulkTransferStatus;
	bulkQuoteId: string;
	bulkTransferId: string;
}

export interface IBulkTransferEntity {
	bulkTransactionId: string;
	bulkHomeTransactionID: string | null;
	request: IBulkTransferRequest;
	individualtransfers: IIndividualTransfers;
	status: IBulkTransferStatus;
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
}

// TODO: check name and status enums.
export enum IBulkTransferStatus {
	ACTIVE = "RECEIVED",
	DELETED = "DISCOVERY_PROCESSING",
	AGREEMENT_PROCESSING = "AGREEMENT_PROCESSING",
	TRANSFER_PROCESSING = "TRANSFER_PROCESSING"
}

export enum IIdType {
	MSISDN = "MSISDN",
	ACCOUNT_ID = "ACCOUNT_ID"
}

export interface Money {
	money: string;
}
export enum Currency {
	AED = "AED",
	AFN = "AFN",
	ALL = "ALL",
	AMD = "AMD",
	ANG = "ANG",
	AOA = "AOA",
	ARS = "ARS",
	AUD = "AUD",
	AWG = "AWG",
	AZN = "AZN",
	BAM = "BAM",
	BBD = "BBD",
	BDT = "BDT",
	BGN = "BGN",
	BHD = "BHD",
	BIF = "BIF",
	BMD = "BMD",
	BND = "BND",
	BOB = "BOB",
	BRL = "BRL",
	BSD = "BSD",
	BTN = "BTN",
	BWP = "BWP",
	BYN = "BYN",
	BZD = "BZD",
	CAD = "CAD",
	CDF = "CDF",
	CHF = "CHF",
	CLP = "CLP",
	CNY = "CNY",
	COP = "COP",
	CRC = "CRC",
	CUC = "CUC",
	CUP = "CUP",
	CVE = "CVE",
	CZK = "CZK",
	DJF = "DJF",
	DKK = "DKK",
	DOP = "DOP",
	DZD = "DZD",
	EGP = "EGP",
	ERN = "ERN",
	ETB = "ETB",
	EUR = "EUR",
	FJD = "FJD",
	FKP = "FKP",
	GBP = "GBP",
	GEL = "GEL",
	GGP = "GGP",
	GHS = "GHS",
	GIP = "GIP",
	GMD = "GMD",
	GNF = "GNF",
	GTQ = "GTQ",
	GYD = "GYD",
	HKD = "HKD",
	HNL = "HNL",
	HRK = "HRK",
	HTG = "HTG",
	HUF = "HUF",
	IDR = "IDR",
	ILS = "ILS",
	IMP = "IMP",
	INR = "INR",
	IQD = "IQD",
	IRR = "IRR",
	ISK = "ISK",
	JEP = "JEP",
	JMD = "JMD",
	JOD = "JOD",
	JPY = "JPY",
	KES = "KES",
	KGS = "KGS",
	KHR = "KHR",
	KMF = "KMF",
	KPW = "KPW",
	KRW = "KRW",
	KWD = "KWD",
	KYD = "KYD",
	KZT = "KZT",
	LAK = "LAK",
	LBP = "LBP",
	LKR = "LKR",
	LRD = "LRD",
	LSL = "LSL",
	LYD = "LYD",
	MAD = "MAD",
	MDL = "MDL",
	MGA = "MGA",
	MKD = "MKD",
	MMK = "MMK",
	MNT = "MNT",
	MOP = "MOP",
	MRO = "MRO",
	MUR = "MUR",
	MVR = "MVR",
	MWK = "MWK",
	MXN = "MXN",
	MYR = "MYR",
	MZN = "MZN",
	NAD = "NAD",
	NGN = "NGN",
	NIO = "NIO",
	NOK = "NOK",
	NPR = "NPR",
	NZD = "NZD",
	OMR = "OMR",
	PAB = "PAB",
	PEN = "PEN",
	PGK = "PGK",
	PHP = "PHP",
	PKR = "PKR",
	PLN = "PLN",
	PYG = "PYG",
	QAR = "QAR",
	RON = "RON",
	RSD = "RSD",
	RUB = "RUB",
	RWF = "RWF",
	SAR = "SAR",
	SBD = "SBD",
	SCR = "SCR",
	SDG = "SDG",
	SEK = "SEK",
	SGD = "SGD",
	SHP = "SHP",
	SLL = "SLL",
	SOS = "SOS",
	SPL = "SPL",
	SRD = "SRD",
	STD = "STD",
	SVC = "SVC",
	SYP = "SYP",
	SZL = "SZL",
	THB = "THB",
	TJS = "TJS",
	TMT = "TMT",
	TND = "TND",
	TOP = "TOP",
	TRY = "TRY",
	TTD = "TTD",
	TVD = "TVD",
	TWD = "TWD",
	TZS = "TZS",
	UAH = "UAH",
	UGX = "UGX",
	USD = "USD",
	UYU = "UYU",
	UZS = "UZS",
	VEF = "VEF",
	VND = "VND",
	VUV = "VUV",
	WST = "WST",
	XAF = "XAF",
	XCD = "XCD",
	XDR = "XDR",
	XOF = "XOF",
	XPF = "XPF",
	XTS = "XTS",
	XXX = "XXX",
	YER = "YER",
	ZAR = "ZAR",
	ZMW = "ZMW",
	ZWD = "ZWD"
}