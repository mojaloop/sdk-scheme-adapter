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
import { SchemaValidationError } from '../errors';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';
import { randomUUID } from 'crypto';
import Ajv from 'ajv';

const ajv = new Ajv({
    strict:false,
    allErrors: false,
});

// TODO: Refine this
export enum BulkTransactionInternalState {
    RECEIVED = 'RECEIVED',
    DISCOVERY_PROCESSING = 'DISCOVERY_PROCESSING',
    DISCOVERY_COMPLETED = 'DISCOVERY_COMPLETED',
    DISCOVERY_ACCEPTANCE_PENDING = 'DISCOVERY_ACCEPTANCE_PENDING',
    AGREEMENT_PROCESSING = 'AGREEMENT_PROCESSING',
    TRANSFERS_PROCESSING = 'TRANSFERS_PROCESSING',
    DISCOVERY_ACCEPTANCE_COMPLETED = 'DISCOVERY_ACCEPTANCE_COMPLETED',
    AGREEMENT_COMPLETED = 'AGREEMENT_COMPLETED',
    AGREEMENT_ACCEPTANCE_PENDING = 'AGREEMENT_ACCEPTANCE_PENDING',
    AGREEMENT_ACCEPTANCE_COMPLETED = 'AGREEMENT_ACCEPTANCE_COMPLETED',
    TRANSFERS_COMPLETED = 'TRANSFERS_COMPLETED',
    TRANSFERS_FAILED = 'TRANSFERS_FAILED',
    RESPONSE_PROCESSING = 'RESPONSE_PROCESSING',
    RESPONSE_SENT = 'RESPONSE_SENT',
}

export interface BulkTransactionState extends BaseEntityState {
    bulkTransactionId: string;
    bulkHomeTransactionID: string;
    options: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionOptions;
    from: SDKSchemeAdapter.V2_1_0.Outbound.Types.Party;
    extensions: SDKSchemeAdapter.V2_1_0.Outbound.Types.ExtensionList_v2_1_0 | undefined;
    state: BulkTransactionInternalState;
}

export class BulkTransactionEntity extends BaseEntity<BulkTransactionState> {

    private static readonly BulkTransactionStateVersion = 1;

    get id(): string {
        return this._state.id;
    }

    get bulkHomeTransactionID(): string {
        return this._state.bulkHomeTransactionID;
    }

    get from(): SDKSchemeAdapter.V2_1_0.Outbound.Types.Party {
        return this._state.from;
    }

    get state(): BulkTransactionInternalState {
        return this._state.state;
    }

    get options(): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionOptions {
        return this._state.options;
    }

    get extensions(): SDKSchemeAdapter.V2_1_0.Outbound.Types.ExtensionList_v2_1_0 | undefined {
        return this._state.extensions;
    }

    static CreateFromRequest(
        request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest,
    ): BulkTransactionEntity {
        BulkTransactionEntity._validateRequest(request);
        const bulkTransactionId = request?.bulkTransactionId || randomUUID();
        const initialState: BulkTransactionState = {
            id: bulkTransactionId,
            bulkTransactionId,
            bulkHomeTransactionID: request?.bulkHomeTransactionID,
            options: request?.options,
            from: request?.from,
            extensions: request?.extensions,
            state: BulkTransactionInternalState.RECEIVED,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: BulkTransactionEntity.BulkTransactionStateVersion,
        };
        return new BulkTransactionEntity(initialState);
    }


    constructor(initialState: BulkTransactionState) {
        super(initialState);
    }

    setTxState(state: BulkTransactionInternalState) {
        this._state.state = state;
    }

    isSkipPartyLookupEnabled() {
        return this._state.options.skipPartyLookup;
    }

    isAutoAcceptPartyEnabled(): boolean {
        return this._state.options.autoAcceptParty.enabled;
    }

    isAutoAcceptQuoteEnabled(): boolean {
        return this._state.options.autoAcceptQuote.enabled;
    }

    // getAutoAcceptQuotePerTransferFeeLimits (): SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkPerTransferFeeLimit[] | undefined {
    //   return this._state.options.autoAcceptQuote.perTransferFeeLimits
    // }

    // getBulkExpiration (): string {
    //   return this._state.options.bulkExpiration
    // }

    private static _validateRequest(request: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest): void {
        const requestSchema = SDKSchemeAdapter.V2_1_0.Outbound.Schemas.bulkTransactionRequest;
        const validate = ajv.compile(requestSchema);
        const validationResult = validate(request);
        if(!validationResult) {
            throw new SchemaValidationError(validate.errors || []);
        }
    }

}
