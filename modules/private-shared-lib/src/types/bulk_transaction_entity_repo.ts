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
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict';

import {
    BulkTransactionState,
    IEntityStateRepository,
    IEntityStateReadOnlyRepository,
    IndividualTransferState,
    BulkBatchState,
} from '@module-domain';

export type IBulkTransactionEntityRepo = {
    getAllIndividualTransferIds: (bulkId: string) => Promise<string[]>
    getIndividualTransfer: (bulkId: string, individualTransferId: string) => Promise<IndividualTransferState>
    setIndividualTransfer: (
        bulkId: string,
        individualTransferId: string,
        value: IndividualTransferState
    ) => Promise<void>
    getAllBulkBatchIds: (bulkId: string) => Promise<string[]>
    getBulkBatch: (bulkId: string, bulkBatchId: string) => Promise<BulkBatchState>
    setBulkBatch: (
        bulkId: string,
        bulkBatchId: string,
        value: BulkBatchState
    ) => Promise<void>
    isBulkIdExists: (bulkId: string) => Promise<boolean>
    getBulkTransfersTotalCount: (bulkId: string) => Promise<number>
    setBulkTransfersTotalCount: (bulkId: string, totalCount: number) => Promise<void>
    getBulkTransfersSuccessCount: (bulkId: string) => Promise<number>
    setBulkTransfersSuccessCount: (bulkId: string, count: number) => Promise<void>
    incrementBulkTransfersSuccessCount: (bulkId: string) => Promise<void>
    getBulkTransfersFailedCount: (bulkId: string) => Promise<number>
    setBulkTransfersFailedCount: (bulkId: string, count: number) => Promise<void>
    getBulkQuotesTotalCount: (bulkId: string) => Promise<number>
    setBulkQuotesTotalCount: (bulkId: string, totalCount: number) => Promise<void>
    getBulkQuotesSuccessCount: (bulkId: string) => Promise<number>
    setBulkQuotesSuccessCount: (bulkId: string, count: number) => Promise<void>
    incrementBulkQuotesSuccessCount: (bulkId: string) => Promise<void>
    getBulkQuotesFailedCount: (bulkId: string) => Promise<number>
    setBulkQuotesFailedCount: (bulkId: string, count: number) => Promise<void>
    incrementBulkQuotesFailedCount: (bulkId: string) => Promise<void>
    setPartyLookupTotalCount: (bulkId: string, count: number) => Promise<void>
    getPartyLookupTotalCount: (bulkId: string) => Promise<number>
    incrementPartyLookupSuccessCount: (bulkId: string, increment: number) => Promise<void>
    setPartyLookupSuccessCount: (bulkId: string, count: number) => Promise<void>
    getPartyLookupSuccessCount: (bulkId: string) => Promise<number>
    incrementPartyLookupFailedCount: (bulkId: string, increment: number) => Promise<void>
    setPartyLookupFailedCount: (bulkId: string, count: number) => Promise<void>
    getPartyLookupFailedCount: (bulkId: string) => Promise<number>
} & IEntityStateRepository<BulkTransactionState>;

export type IBulkTransactionEntityReadOnlyRepo = {
    getAllIndividualTransferIds: (bulkId: string) => Promise<string[]>
    getIndividualTransfer: (bulkId: string, individualTransferId: string) => Promise<IndividualTransferState>
    isBulkIdExists: (bulkId: string) => Promise<boolean>
    getBulkTransfersTotalCount: (bulkId: string) => Promise<number>
    setBulkTransfersTotalCount: (bulkId: string, totalCount: number) => Promise<void>
    getBulkTransfersSuccessCount: (bulkId: string) => Promise<number>
    getBulkTransfersFailedCount: (bulkId: string) => Promise<number>
    getBulkQuotesTotalCount: (bulkId: string) => Promise<number>
    getBulkQuotesSuccessCount: (bulkId: string) => Promise<number>
    getBulkQuotesFailedCount: (bulkId: string) => Promise<number>
    getPartyLookupTotalCount: (bulkId: string) => Promise<number>
    getPartyLookupSuccessCount: (bulkId: string) => Promise<number>
    getPartyLookupFailedCount: (bulkId: string) => Promise<number>
} & IEntityStateReadOnlyRepository<BulkTransactionState>;
