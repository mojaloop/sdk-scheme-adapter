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
    BaseEntityState,
    BaseEntity,
    SchemaValidationError,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { SDKSchemeAdapter, v1_1 as FSPIOP } from '@mojaloop/api-snippets';
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
    AGREEMENT_SUCCESS = 'AGREEMENT_SUCCESS',
    AGREEMENT_FAILED = 'AGREEMENT_FAILED',
    TRANSFER_PROCESSING = 'TRANSFER_PROCESSING',
}

export interface BulkBatchState extends BaseEntityState {
    id: string;
    state: BulkBatchInternalState;
    bulkId: string;
    bulkQuoteId: string;
    bulkTransferId: string;
    bulkQuotesRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteRequest;
    bulkQuotesResponse?: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse;
    bulkTransfersRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest;
    bulkTransfersResponse?: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse;
    quoteIdReferenceIdMap: {[quoteId: string]: string};
    transferIdReferenceIdMap: {[quoteId: string]: string};
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    lastError?: any; // TODO: Define a format for this
}

export class BulkBatchEntity extends BaseEntity<BulkBatchState> {

    get id(): string {
        return this._state.id;
    }
    get bulkQuoteId(): string {
        return this._state.bulkQuoteId;
    }
    get bulkTransferId(): string {
        return this._state.bulkTransferId;
    }

    get bulkQuotesRequest(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteRequest {
        return this._state.bulkQuotesRequest;
    }
    get bulkQuotesResponse(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse | undefined {
        return this._state.bulkQuotesResponse;
    }
    get bulkTransfersRequest(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest {
        return this._state.bulkTransfersRequest;
    }
    get bulkTransfersResponse(): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse | undefined {
        return this._state.bulkTransfersResponse;
    }

    private static _convertPartyToFrom(party: SDKSchemeAdapter.Outbound.V2_0_0.Types.Party): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteRequest['from'] {
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
            extensionList: party.partyIdInfo.extensionList?.extension
        }
    }

    static CreateEmptyBatch(
        bulkTransactionEntity: BulkTransactionEntity
    ): BulkBatchEntity {

        const bulkQuoteId = randomUUID();
        const bulkTransferId = randomUUID();

        const initialState: BulkBatchState = {
            id: randomUUID(),
            state: BulkBatchInternalState.CREATED,
            bulkId: bulkTransactionEntity.id,
            bulkQuoteId,
            bulkTransferId,
            bulkQuotesRequest: {
                homeTransactionId: bulkTransactionEntity.bulkHomeTransactionID,
                bulkQuoteId,
                from: BulkBatchEntity._convertPartyToFrom(bulkTransactionEntity.from),
                individualQuotes: [],
                extensions: bulkTransactionEntity.extensions
            },
            bulkTransfersRequest: {
                homeTransactionId: bulkTransactionEntity.bulkHomeTransactionID,
                bulkTransferId,
                from: BulkBatchEntity._convertPartyToFrom(bulkTransactionEntity.from),
                individualTransfers: [],
                extensions: bulkTransactionEntity.extensions
            },
            quoteIdReferenceIdMap: {},
            transferIdReferenceIdMap: {},
            created_at: Date.now(),
            updated_at: Date.now(),
            version: 1,
        };
        return new BulkBatchEntity(initialState);
    }

    addIndividualQuote(individualQuote: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualQuote, referenceId: string) {
        this._state.bulkQuotesRequest.individualQuotes.push(individualQuote);
        this._state.quoteIdReferenceIdMap[individualQuote.quoteId] = referenceId;
    }

    addIndividualTransfer(individualTransfer: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransfer, referenceId: string) {
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

    setBulkQuotesResponse(response: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteResponse) {
        this._state.bulkQuotesResponse = response;
    }

    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
    constructor(initialState: BulkBatchState) {
        // Commenting the validation in the constuctor to allow creation of bulkQuotes without any individualQuotes items
        // BulkBatchEntity._validateBulkQuotesRequest(initialState.bulkQuotesRequest);
        // BulkBatchEntity._validateBulkTransfersRequest(initialState.bulkTransfersRequest);
        super(initialState);
    }

    
    validateBulkQuotesRequest() {
        BulkBatchEntity._validateBulkQuotesRequest(this._state.bulkQuotesRequest);
    }

    validateBulkTransfersRequest() {
        BulkBatchEntity._validateBulkTransfersRequest(this._state.bulkTransfersRequest);
    }
    
    private static _validateBulkQuotesRequest(request: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkQuoteRequest): void {
        const requestSchema = SDKSchemeAdapter.Outbound.V2_0_0.Schemas.bulkQuoteRequest;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

    private static _validateBulkTransfersRequest(request: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest): void {
        const requestSchema = SDKSchemeAdapter.Outbound.V2_0_0.Schemas.bulkTransferRequest;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
