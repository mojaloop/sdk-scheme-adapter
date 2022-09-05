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
} from '@module-domain';

export type IBulkTransactionEntityRepo = {
    getAllIndividualTransferIds: (bulkId: string) => Promise<string[]>
    getIndividualTransfer: (bulkId: string, individualTransferId: string) => Promise<IndividualTransferState>
    setIndividualTransfer: (
        bulkId: string,
        individualTransferId: string,
        value: IndividualTransferState
    ) => Promise<void>
    isBulkIdExists: (bulkId: string) => Promise<boolean>
    setPartyLookupTotalCount: (bulkId: string, count: number) => Promise<void>
    getPartyLookupTotalCount: (bulkId: string, count: number) => Promise<number>
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
    getPartyLookupTotalCount: (bulkId: string, count: number) => Promise<number>
    getPartyLookupSuccessCount: (bulkId: string) => Promise<number>
    getPartyLookupFailedCount: (bulkId: string) => Promise<number>
} & IEntityStateReadOnlyRepository<BulkTransactionState>;
