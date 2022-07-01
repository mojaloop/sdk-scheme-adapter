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

 * Coil
 - Donovan Changfoot <donovan.changfoot@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * ModusBox
 - Miguel de Barros <miguel.debarros@modusbox.com>
 - Roman Pietrzak <roman.pietrzak@modusbox.com>

 --------------
******/

'use strict'
// TODO: Move to config management in future

export enum MLTopics {
  'Events' = 'MLIngressEvents',
}

export enum ParticipantsTopics {
  'Commands' = 'ParticipantCommands',
  'DomainEvents' = 'ParticipantDomainEvents',
  'StateEvents' = 'ParticipantStateEvents',
  'SnapshotEvents' = 'ParticipantSnapshotEvents',
  'SnapshotOperatorCommands' = 'SnapshotOperatorCommands'
}

export enum ParticipantAccountTypes {
  POSITION = 'POSITION',
  SETTLEMENT = 'SETTLEMENT',
  HUB_RECONCILIATION = 'HUB_RECONCILIATION',
  HUB_MULTILATERAL_SETTLEMENT = 'HUB_MULTILATERAL_SETTLEMENT',
  HUB_FEE = 'HUB_FEE',
  INTERCHANGE_FEE = 'INTERCHANGE_FEE'
}

export enum AccountLimitTypes {
  NET_DEBIT_CAP = 'NET_DEBIT_CAP'
}

export enum TransfersTopics {
  'Commands' = 'TransferCommands',
  'DomainEvents' = 'TransferDomainEvents',
  'StateEvents' = 'TransferStateEvents',
  'SnapshotEvents' = 'TransferSnapshotEvents'
}

export enum TransferInternalStates {
  ABORTED_ERROR = 'ABORTED_ERROR',
  ABORTED_REJECTED = 'ABORTED_REJECTED',
  COMMITTED = 'COMMITTED',
  EXPIRED_PREPARED = 'EXPIRED_PREPARED',
  EXPIRED_RESERVED = 'EXPIRED_RESERVED',
  FAILED = 'FAILED',
  INVALID = 'INVALID',
  RECEIVED_ERROR = 'RECEIVED_ERROR',
  RECEIVED_FULFIL = 'RECEIVED_FULFIL',
  RECEIVED_PREPARE = 'RECEIVED_PREPARE',
  RECEIVED_REJECT = 'RECEIVED_REJECT',
  RESERVED = 'RESERVED',
  RESERVED_TIMEOUT = 'RESERVED_TIMEOUT'
}

export enum CurrencyTypes {
  AED = 'AED',
  AFA = 'AFA',
  AFN = 'AFN',
  ALL = 'ALL',
  AMD = 'AMD',
  ANG = 'ANG',
  AOA = 'AOA',
  AOR = 'AOR',
  ARS = 'ARS',
  AUD = 'AUD',
  AWG = 'AWG',
  AZN = 'AZN',
  BAM = 'BAM',
  BBD = 'BBD',
  BDT = 'BDT',
  BGN = 'BGN',
  BHD = 'BHD',
  BIF = 'BIF',
  BMD = 'BMD',
  BND = 'BND',
  BOB = 'BOB',
  BOV = 'BOV',
  BRL = 'BRL',
  BSD = 'BSD',
  BTN = 'BTN',
  BWP = 'BWP',
  BYN = 'BYN',
  BYR = 'BYR',
  BZD = 'BZD',
  CAD = 'CAD',
  CDF = 'CDF',
  CHE = 'CHE',
  CHF = 'CHF',
  CHW = 'CHW',
  CLF = 'CLF',
  CLP = 'CLP',
  CNY = 'CNY',
  COP = 'COP',
  COU = 'COU',
  CRC = 'CRC',
  CUC = 'CUC',
  CUP = 'CUP',
  CVE = 'CVE',
  CZK = 'CZK',
  DJF = 'DJF',
  DKK = 'DKK',
  DOP = 'DOP',
  DZD = 'DZD',
  EEK = 'EEK',
  EGP = 'EGP',
  ERN = 'ERN',
  ETB = 'ETB',
  EUR = 'EUR',
  FJD = 'FJD',
  FKP = 'FKP',
  GBP = 'GBP',
  GEL = 'GEL',
  GGP = 'GGP',
  GHS = 'GHS',
  GIP = 'GIP',
  GMD = 'GMD',
  GNF = 'GNF',
  GTQ = 'GTQ',
  GYD = 'GYD',
  HKD = 'HKD',
  HNL = 'HNL',
  HRK = 'HRK',
  HTG = 'HTG',
  HUF = 'HUF',
  IDR = 'IDR',
  ILS = 'ILS',
  IMP = 'IMP',
  INR = 'INR',
  IQD = 'IQD',
  IRR = 'IRR',
  ISK = 'ISK',
  JEP = 'JEP',
  JMD = 'JMD',
  JOD = 'JOD',
  JPY = 'JPY',
  KES = 'KES',
  KGS = 'KGS',
  KHR = 'KHR',
  KMF = 'KMF',
  KPW = 'KPW',
  KRW = 'KRW',
  KWD = 'KWD',
  KYD = 'KYD',
  KZT = 'KZT',
  LAK = 'LAK',
  LBP = 'LBP',
  LKR = 'LKR',
  LRD = 'LRD',
  LSL = 'LSL',
  LTL = 'LTL',
  LVL = 'LVL',
  LYD = 'LYD',
  MAD = 'MAD',
  MDL = 'MDL',
  MGA = 'MGA',
  MKD = 'MKD',
  MMK = 'MMK',
  MNT = 'MNT',
  MOP = 'MOP',
  MRO = 'MRO',
  MUR = 'MUR',
  MVR = 'MVR',
  MWK = 'MWK',
  MXN = 'MXN',
  MXV = 'MXV',
  MYR = 'MYR',
  MZN = 'MZN',
  NAD = 'NAD',
  NGN = 'NGN',
  NIO = 'NIO',
  NOK = 'NOK',
  NPR = 'NPR',
  NZD = 'NZD',
  OMR = 'OMR',
  PAB = 'PAB',
  PEN = 'PEN',
  PGK = 'PGK',
  PHP = 'PHP',
  PKR = 'PKR',
  PLN = 'PLN',
  PYG = 'PYG',
  QAR = 'QAR',
  RON = 'RON',
  RSD = 'RSD',
  RUB = 'RUB',
  RWF = 'RWF',
  SAR = 'SAR',
  SBD = 'SBD',
  SCR = 'SCR',
  SDG = 'SDG',
  SEK = 'SEK',
  SGD = 'SGD',
  SHP = 'SHP',
  SLL = 'SLL',
  SOS = 'SOS',
  SPL = 'SPL',
  SRD = 'SRD',
  SSP = 'SSP',
  STD = 'STD',
  SVC = 'SVC',
  SYP = 'SYP',
  SZL = 'SZL',
  THB = 'THB',
  TJS = 'TJS',
  TMT = 'TMT',
  TND = 'TND',
  TOP = 'TOP',
  TRY = 'TRY',
  TTD = 'TTD',
  TVD = 'TVD',
  TWD = 'TWD',
  TZS = 'TZS',
  UAH = 'UAH',
  UGX = 'UGX',
  USD = 'USD',
  USN = 'USN',
  UYI = 'UYI',
  UYU = 'UYU',
  UZS = 'UZS',
  VEF = 'VEF',
  VND = 'VND',
  VUV = 'VUV',
  WST = 'WST',
  XAF = 'XAF',
  XAG = 'XAG',
  XAU = 'XAU',
  XCD = 'XCD',
  XDR = 'XDR',
  XFO = 'XFO',
  XFU = 'XFU',
  XOF = 'XOF',
  XPD = 'XPD',
  XPF = 'XPF',
  XPT = 'XPT',
  XSU = 'XSU',
  XTS = 'XTS',
  XUA = 'XUA',
  XXX = 'XXX',
  YER = 'YER',
  ZAR = 'ZAR',
  ZMK = 'ZMK',
  ZMW = 'ZMW',
  ZWD = 'ZWD',
  ZWL = 'ZWL',
  ZWN = 'ZWN',
  ZWR = 'ZWR'
}
