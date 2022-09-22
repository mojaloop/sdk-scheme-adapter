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

import { BaseEntityState, BaseEntity } from './';
import { IPartyResult, PartyInfoRequest } from '@module-types';
import { SchemaValidationError } from '../errors';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
import { randomUUID } from 'crypto';
import Ajv from 'ajv';
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

export interface IndividualTransferState extends BaseEntityState {
    id: string;
    request: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionIndividualTransfer;
    state: IndividualTransferInternalState;
    batchId?: string;
    partyRequest?: PartyInfoRequest;
    partyResponse?: IPartyResult
    acceptParty?: boolean;
    acceptQuote?: boolean;
    quoteResponse?: SDKSchemeAdapter.V2_0_0.Outbound.Types.individualQuoteResult;
    transferResponse?: SDKSchemeAdapter.V2_0_0.Outbound.Types.individualTransferResult;
    lastError?: SDKSchemeAdapter.V2_0_0.Outbound.Types.transferError;
}

export class IndividualTransferEntity extends BaseEntity<IndividualTransferState> {

    private static readonly IndividualTransferStateVersion = 1;

    get id(): string {
        return this._state.id;
    }

    get request(): SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionIndividualTransfer {
        return this._state.request;
    }

    get partyResponse(): IPartyResult | undefined {
        return this._state.partyResponse;
    }

    get quoteResponse(): SDKSchemeAdapter.V2_0_0.Outbound.Types.individualQuoteResult | undefined {
        return this._state.quoteResponse;
    }

    get transferResponse(): SDKSchemeAdapter.V2_0_0.Outbound.Types.individualTransferResult | undefined {
        return this._state.transferResponse;
    }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    static CreateFromRequest(
        request: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionIndividualTransfer,
    ): IndividualTransferEntity {
    // IndividualTransferEntity._validateRequest(request)
        const initialState: IndividualTransferState = {
            id: randomUUID(),
            request,
            state: IndividualTransferInternalState.RECEIVED,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: IndividualTransferEntity.IndividualTransferStateVersion,
        };
        return new IndividualTransferEntity(initialState);
    }

    get payee(): SDKSchemeAdapter.V2_0_0.Outbound.Types.Party {
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

    setPartyResponse(response: IPartyResult) {
        this._state.partyResponse = response;
    }

    setQuoteResponse(response: SDKSchemeAdapter.V2_0_0.Outbound.Types.individualQuoteResult) {
        this._state.quoteResponse = response;
    }

    setTransferResponse(response: SDKSchemeAdapter.V2_0_0.Outbound.Types.individualTransferResult) {
        this._state.transferResponse = response;
    }

    setAcceptParty(acceptParty: boolean) {
        this._state.acceptParty = acceptParty;
    }

    // get payeeResolved(): boolean {
    // //     return !!this._state.partyResponse;
    // //     return !!this._state.state == IndividualTransferInternalState.DISCOVERY_SUCCESS;
    // // }

    get transferState() {
        return this._state.state;
    }

    get toFspId(): string | undefined {
        return this._state.partyResponse?.party?.partyIdInfo?.fspId;
    }

    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
    constructor(initialState: IndividualTransferState) {
        IndividualTransferEntity._validateRequest(initialState.request);
        super(initialState);
    }

    private static _validateRequest(request: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionIndividualTransfer): void {
        const requestSchema = SDKSchemeAdapter.V2_0_0.Outbound.Schemas.bulkTransactionIndividualTransfer;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
