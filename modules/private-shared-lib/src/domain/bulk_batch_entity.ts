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
 - Name Surname <name.surname@mojaloop.io>
 * Infitx
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

'use strict';

import {
    BaseEntityState,
    BaseEntity,
} from '.';
import {
    BulkQuoteResponse,
    BulkTransferResponse,
    SchemaValidationError,
} from '..';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
import { randomUUID } from 'crypto';
import Ajv from 'ajv';
import { BulkTransactionEntity } from './bulk_transaction_entity';
const ajv = new Ajv({
    strict:false,
    allErrors: false,
});

// TODO: check name and status enums.
export enum BulkBatchInternalState {
    CREATED = 'CREATED',
    AGREEMENT_PROCESSING = 'AGREEMENT_PROCESSING',
    AGREEMENT_COMPLETED = 'AGREEMENT_COMPLETED',
    AGREEMENT_FAILED = 'AGREEMENT_FAILED',
    TRANSFERS_PROCESSING = 'TRANSFERS_PROCESSING',
    TRANSFERS_FAILED = 'TRANSFERS_FAILED',
    TRANSFERS_COMPLETED = 'TRANSFERS_COMPLETED',
}

export interface BulkBatchState extends BaseEntityState {
    id: string;
    state: BulkBatchInternalState;
    bulkId: string;
    bulkQuoteId: string;
    bulkTransferId: string;
    bulkQuotesRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteRequest;
    bulkQuotesResponse?: BulkQuoteResponse;
    bulkTransfersRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransferRequest;
    bulkTransfersResponse?: BulkTransferResponse;
    quoteIdReferenceIdMap: { [quoteId: string]: string }; // Key = individual quoteId from bulkQuotesRequest, Value = transactionId representing an individual transfer from the bulkTransaction
    transferIdReferenceIdMap: { [transactionId: string]: string }; // Key = individual transferId from bulkTransferRequest, Value = transactionId representing an individual transfer from the bulkTransaction
    lastError?: SDKSchemeAdapter.V2_1_0.Outbound.Types.transferError;
}

export class BulkBatchEntity extends BaseEntity<BulkBatchState> {

    private static readonly BulkBatchStateVersion = 1;

    get id(): string {
        return this._state.id;
    }

    get bulkQuoteId(): string {
        return this._state.bulkQuoteId;
    }

    get bulkTransferId(): string {
        return this._state.bulkTransferId;
    }

    get bulkQuotesRequest(): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteRequest {
        return this._state.bulkQuotesRequest;
    }

    get bulkQuotesResponse(): BulkQuoteResponse | undefined {
        return this._state.bulkQuotesResponse;
    }

    get bulkTransfersRequest(): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransferRequest {
        return this._state.bulkTransfersRequest;
    }

    get bulkTransfersResponse(): BulkTransferResponse | undefined {
        return this._state.bulkTransfersResponse;
    }

    get quoteIdReferenceIdMap(): { [quoteId: string]: string } {
        return this._state.quoteIdReferenceIdMap;
    }

    get transferIdReferenceIdMap(): { [transactionId: string]: string } {
        return this._state.transferIdReferenceIdMap;
    }

    get lastError() {
        return this._state.lastError;
    }

    private static _convertPartyToFrom(party: SDKSchemeAdapter.V2_1_0.Outbound.Types.Party): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteRequest['from'] {
        return {
            idType: party.partyIdInfo.partyIdType,
            idValue: party.partyIdInfo.partyIdentifier,
            idSubValue: party.partyIdInfo.partySubIdOrType,
            displayName: party.name,
            firstName: party.personalInfo?.complexName?.firstName,
            middleName: party.personalInfo?.complexName?.middleName,
            lastName: party.personalInfo?.complexName?.lastName,
            dateOfBirth: party.personalInfo?.dateOfBirth,
            merchantClassificationCode: party.merchantClassificationCode,
            fspId: party.partyIdInfo.fspId,
            extensionList: party.partyIdInfo.extensionList?.extension,
        };
    }

    static CreateEmptyBatch(
        bulkTransactionEntity: BulkTransactionEntity,
    ): BulkBatchEntity {

        const id = randomUUID();
        const bulkQuoteId = id;
        const bulkTransferId = id;

        const initialState: BulkBatchState = {
            id,
            state: BulkBatchInternalState.CREATED,
            bulkId: bulkTransactionEntity.id,
            bulkQuoteId,
            bulkTransferId,
            bulkQuotesRequest: {
                homeTransactionId: bulkTransactionEntity.bulkHomeTransactionID,
                bulkQuoteId,
                from: BulkBatchEntity._convertPartyToFrom(bulkTransactionEntity.from),
                individualQuotes: [],
                extensions: bulkTransactionEntity.extensions,
            },
            bulkTransfersRequest: {
                bulkTransferId,
                bulkQuoteId,
                homeTransactionId: bulkTransactionEntity.bulkHomeTransactionID,
                from: BulkBatchEntity._convertPartyToFrom(bulkTransactionEntity.from),
                individualTransfers: [],
                extensions: bulkTransactionEntity.extensions,
            },
            quoteIdReferenceIdMap: {},
            transferIdReferenceIdMap: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: BulkBatchEntity.BulkBatchStateVersion,
        };
        return new BulkBatchEntity(initialState);
    }

    addIndividualQuote(individualQuote: SDKSchemeAdapter.V2_1_0.Outbound.Types.individualQuote, referenceId: string) {
        this._state.bulkQuotesRequest.individualQuotes.push(individualQuote);
        this._state.quoteIdReferenceIdMap[individualQuote.quoteId] = referenceId;
    }

    addIndividualTransfer(
        individualTransfer: SDKSchemeAdapter.V2_1_0.Outbound.Types.individualTransfer,
        referenceId: string,
    ) {
        this._state.bulkTransfersRequest.individualTransfers.push(individualTransfer);
        this._state.transferIdReferenceIdMap[individualTransfer.transferId] = referenceId;
    }

    getReferenceIdForQuoteId(quoteId: string) : string {
        return this._state.quoteIdReferenceIdMap[quoteId];
    }

    getReferenceIdForTransferId(transferId: string) : string {
        return this._state.transferIdReferenceIdMap[transferId];
    }

    get state() {
        return this._state.state;
    }

    setState(state: BulkBatchInternalState) {
        this._state.state = state;
    }

    setBulkQuotesResponse(response: BulkQuoteResponse) {
        this._state.bulkQuotesResponse = response;
    }

    setBulkTransfersResponse(response: BulkTransferResponse) {
        this._state.bulkTransfersResponse = response;
    }

    setLastError(response: SDKSchemeAdapter.V2_1_0.Outbound.Types.transferError) {
        this._state.lastError = response;
    }

    validateBulkQuotesRequest() {
        BulkBatchEntity._validateBulkQuotesRequest(this._state.bulkQuotesRequest);
    }

    validateBulkTransfersRequest() {
        BulkBatchEntity._validateBulkTransfersRequest(this._state.bulkTransfersRequest);
    }

    private static _validateBulkQuotesRequest(request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteRequest): void {
        const requestSchema = SDKSchemeAdapter.V2_1_0.Outbound.Schemas.bulkQuoteRequest;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

    private static _validateBulkTransfersRequest(request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransferRequest): void {
        const requestSchema = SDKSchemeAdapter.V2_1_0.Outbound.Schemas.bulkTransferRequest;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
