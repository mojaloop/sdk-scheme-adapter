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
    AGREEMENT_PROCESSING = 'AGREEMENT_PROCESSING',
    TRANSFER_PROCESSING = 'TRANSFER_PROCESSING',
}

export interface IndividualTransferState extends BaseEntityState {
    id: string;
    request: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransaction;
    state: IndividualTransferInternalState;
    batchId?: string;
    // TODO: FSPIOP in api-snippets should export the `PartiesByTypeAndID` schema and refer that in the following line
    partyRequest?: any;
    partyResponse?: FSPIOP.Schemas.PartyResult
    acceptParty?: boolean;
    acceptQuote?: boolean;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    lastError?: any; // TODO: Define a format for this
}

export class IndividualTransferEntity extends BaseEntity<IndividualTransferState> {

    get id(): string {
        return this._state.id;
    }

    get request(): SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransaction {
        return this._state.request;
    }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    static CreateFromRequest(request: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransaction): IndividualTransferEntity {
    // IndividualTransferEntity._validateRequest(request)
        const initialState: IndividualTransferState = {
            id: randomUUID(),
            request,
            state: IndividualTransferInternalState.RECEIVED,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: 1,
        };
        return new IndividualTransferEntity(initialState);
    }

    get payee(): SDKSchemeAdapter.Outbound.V2_0_0.Types.Party {
        return this._state.request.to;
    }

    get isPartyInfoExists() {
        return this._state.request.to.partyIdInfo.fspId;
    }

    setTransferState(state: IndividualTransferInternalState) {
        this._state.state = state;
    }

    // TODO: FSPIOP in api-snippets should export the `PartiesByTypeAndID` schema and refer that in the following line
    setPartyRequest(request: any) {
        this._state.partyRequest = request;
    }

    setPartyResponse(request: FSPIOP.Schemas.PartyResult) {
        this._state.partyResponse = request;
    }

    // get payeeResolved(): boolean {
    // //     return !!this._state.partyResponse;
    // //     return !!this._state.state == IndividualTransferInternalState.DISCOVERY_SUCCESS;
    // // }

    get transferState() {
        return this._state.state;
    }

    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
    constructor(initialState: IndividualTransferState) {
        IndividualTransferEntity._validateRequest(initialState.request);
        super(initialState);
    }

    private static _validateRequest(request: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransaction): void {
        const requestSchema = SDKSchemeAdapter.Outbound.V2_0_0.Schemas.individualTransaction;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
