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

import { BaseEntityState, BaseEntity, AjvValidationError } from '@mojaloop/sdk-scheme-adapter-public-shared-lib';
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
    DISCOVERY_SUCCESS = 'DISCOVERY_SUCCESS',
    AGREEMENT_PROCESSING = 'AGREEMENT_PROCESSING',
    TRANSFER_PROCESSING = 'TRANSFER_PROCESSING',
}

// TODO: Standardize the following
export interface IHttpRequest {
    method: string;
    path: string;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    headers: any;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    body: any;
}

export type IPartyRequest = IHttpRequest;

export interface IndividualTransferState extends BaseEntityState {
    id: string;
    request: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransfer;
    state: IndividualTransferInternalState;
    batchId?: string;
    partyRequest?: IPartyRequest; // TODO: This should be defined in public repo extending a http request interface similar to (http request or axios request object)
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

    get request(): SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransfer {
        return this._state.request;
    }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    static CreateFromRequest(request: any): IndividualTransferEntity {
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

    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
    constructor(initialState: IndividualTransferState) {
        IndividualTransferEntity._validateRequest(initialState.request);
        super(initialState);
    }

    private static _validateRequest(request: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransfer): void {
        const requestSchema = SDKSchemeAdapter.Outbound.V2_0_0.Schemas.individualTransfer;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new AjvValidationError(validate.errors || []);
        }
    }

}
