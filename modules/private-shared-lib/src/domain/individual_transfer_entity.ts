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

import { BaseEntityState, BaseEntity } from './';
import { PartyInfoRequest, PartyResponse } from '@module-types';
import { SchemaValidationError } from '../errors';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
import { randomUUID } from 'crypto';
import Ajv from 'ajv';
import { Enum as CentralServicedSharedEnum } from '@mojaloop/central-services-shared';
const ajv = new Ajv({
    strict:false,
    allErrors: false,
});

// TODO: check name and status enums.
export enum IndividualTransferInternalState {
    RECEIVED = 'RECEIVED',
    DISCOVERY_PROCESSING = 'DISCOVERY_PROCESSING',
    DISCOVERY_FAILED = 'DISCOVERY_FAILED',
    DISCOVERY_SUCCESS = 'DISCOVERY_SUCCESS',
    DISCOVERY_ACCEPTED = 'DISCOVERY_ACCEPTED',
    DISCOVERY_REJECTED = 'DISCOVERY_REJECTED',
    AGREEMENT_PROCESSING = 'AGREEMENT_PROCESSING',
    AGREEMENT_SUCCESS = 'AGREEMENT_SUCCESS',
    AGREEMENT_FAILED = 'AGREEMENT_FAILED',
    AGREEMENT_ACCEPTED = 'AGREEMENT_ACCEPTED',
    AGREEMENT_REJECTED = 'AGREEMENT_REJECTED',
    TRANSFERS_PROCESSING = 'TRANSFERS_PROCESSING',
    TRANSFERS_FAILED = 'TRANSFERS_FAILED',
    TRANSFERS_SUCCESS = 'TRANSFERS_SUCCESS',
}

export interface IndividualQuoteResponse extends SDKSchemeAdapter.V2_1_0.Outbound.Types.individualQuoteResult {
    expiration: SDKSchemeAdapter.V2_1_0.Outbound.Types.DateTime;
}

export interface IndividualTransferResponse extends SDKSchemeAdapter.V2_1_0.Outbound.Types.individualTransferResult {
    completedTimestamp?: SDKSchemeAdapter.V2_1_0.Outbound.Types.DateTime;
}

export type IndividualTransferError = SDKSchemeAdapter.V2_1_0.Outbound.Types.transferError;
// TODO: Extend API-Snippets lastError with the following types
// SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransferErrorResponse |
// SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteErrorResponse |
// SDKSchemeAdapter.V2_1_0.Outbound.Types.partyError;

export interface IndividualTransferState extends BaseEntityState {
    id: string;
    request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionIndividualTransfer;
    state: IndividualTransferInternalState;
    batchId?: string;
    partyRequest?: PartyInfoRequest;
    partyResponse?: PartyResponse;
    acceptParty?: boolean;
    acceptQuote?: boolean;
    quoteResponse?: IndividualQuoteResponse;
    transferResponse?: IndividualTransferResponse;
    lastError?: IndividualTransferError;
    transactionId?: string;
}

export class IndividualTransferEntity extends BaseEntity<IndividualTransferState> {

    private static readonly IndividualTransferStateVersion = 1;

    get id(): string {
        return this._state.id;
    }

    get transferId(): string {
        return this.id;
    }

    get quoteId(): string {
        return this.id;
    }

    get transactionId(): string {
        return this._state.transactionId as string;
    }

    get request(): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionIndividualTransfer {
        return this._state.request;
    }

    get partyResponse(): PartyResponse | undefined {
        return this._state.partyResponse;
    }

    get quoteResponse(): IndividualQuoteResponse | undefined {
        return this._state.quoteResponse;
    }

    get transferResponse(): IndividualTransferResponse | undefined {
        return this._state.transferResponse;
    }

    get acceptParty(): boolean | undefined {
        return this._state.acceptParty;
    }

    get acceptQuote(): boolean | undefined {
        return this._state.acceptQuote;
    }


    static CreateFromRequest(
        request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionIndividualTransfer,
    ): IndividualTransferEntity {
    // IndividualTransferEntity._validateRequest(request)
        const initialState: IndividualTransferState = {
            id: randomUUID(),
            request,
            state: IndividualTransferInternalState.RECEIVED,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: IndividualTransferEntity.IndividualTransferStateVersion,
            lastError: request.lastError,
        };
        return new IndividualTransferEntity(initialState);
    }

    get payee(): SDKSchemeAdapter.V2_1_0.Outbound.Types.Party {
        return this._state.request.to;
    }

    get isPartyInfoExists() {
        return this._state.request.to.partyIdInfo.fspId;
    }

    setTransferState(state: IndividualTransferInternalState) {
        this._state.state = state;
    }

    setPartyRequest(request: PartyInfoRequest) {
        this._state.partyRequest = request;
    }

    setPartyResponse(response: PartyResponse) {
        this._state.partyResponse = response;
    }

    setQuoteResponse(response: IndividualQuoteResponse) {
        this._state.quoteResponse = response;
    }

    setTransferResponse(response: IndividualTransferResponse) {
        this._state.transferResponse = response;
    }

    setAcceptParty(acceptParty: boolean) {
        this._state.acceptParty = acceptParty;
    }

    setAcceptQuote(acceptQuote: boolean) {
        this._state.acceptQuote = acceptQuote;
    }

    // This refers to the bulk batch id.
    setTransactionId(transactionId: string) {
        this._state.transactionId = transactionId;
    }

    setLastError(lastError?: IndividualTransferError) {
        this._state.lastError = lastError;
    }

    // get payeeResolved(): boolean {
    // //     return !!this._state.partyResponse;
    // //     return !!this._state.state == IndividualTransferInternalState.DISCOVERY_SUCCESS;
    // // }

    get transferState() {
        return this._state.state;
    }

    get lastError() {
        return this._state.lastError;
    }

    get toFspId(): string | undefined {
        return this._state.partyResponse?.party?.partyIdInfo?.fspId;
    }

    toIndividualTransferResult(): SDKSchemeAdapter.V2_1_0.Backend.Types.bulkTransactionIndividualTransferResult {
        // TODO: Should we infer the FSPIOP-transferState for the individualTransfer based on the SDK-IndividualTransferInternalState? See comments below in the Fulfil mapping.
        // eslint-disable-next-line max-len
        const transferState = (this.transferState === IndividualTransferInternalState.TRANSFERS_SUCCESS) ? CentralServicedSharedEnum.Transfers.TransferState.COMMITTED : CentralServicedSharedEnum.Transfers.TransferState.ABORTED;
        return {
            transferId: this.transferId,
            homeTransactionId: this.request.homeTransactionId,
            transactionId: this.transactionId,
            quoteId: this.quoteResponse?.quoteId,
            to: this.partyResponse?.party || this.payee,
            amountType: this.request.amountType,
            amount: this.request.amount,
            currency: this.request.currency,
            quoteResponse: this.quoteResponse,
            ...(this.transferResponse && {
                fulfil: {
                    ...this.transferResponse,
                    transferState,
                },
            }),
            quoteExtensions: this.quoteResponse?.extensionList,
            transferExtensions: this.transferResponse?.extensionList,
            lastError: this.lastError,
        };
    }

    constructor(initialState: IndividualTransferState) {
        IndividualTransferEntity._validateRequest(initialState.request);
        super(initialState);
    }

    private static _validateRequest(request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionIndividualTransfer): void {
        const requestSchema = SDKSchemeAdapter.V2_1_0.Outbound.Schemas.bulkTransactionIndividualTransfer;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
