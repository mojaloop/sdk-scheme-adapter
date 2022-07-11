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

'use strict'

import { BaseEntityState, BaseEntity } from '../domain'
import { SDKSchemeAdapter } from '@mojaloop/api-snippets'
import { randomUUID } from 'crypto'
import Ajv from 'ajv'
import { ErrorObject } from 'ajv'
const ajv = new Ajv({
  strict:false,
  allErrors: false
  // validateSchema: false
})
// ajv.addKeyword({
//   keyword: 'example'
// })


export class ValidationError extends Error {
  private _errors: ErrorObject[] = []
  constructor(errors: ErrorObject[]) {
    const errorMessage = errors.map(error => `${error.schemaPath} ${error.message}`).join(',')
    super(`Validation Errors: ${errorMessage}`)
    this._errors = errors
  }
  get errors() { return this._errors }
}

export interface SDKOutboundBulkRequestState extends BaseEntityState {
  request: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest
}

export class SDKOutboundBulkRequestEntity extends BaseEntity<SDKOutboundBulkRequestState> {

  get id (): string {
    return this._state.id
  }

  get request (): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest {
    return this._state.request
  }

  static CreateFromRequest (request: any): SDKOutboundBulkRequestEntity {
    SDKOutboundBulkRequestEntity._validateRequest(request)
    const initialState: SDKOutboundBulkRequestState = {
      id: request?.bulkTransactionId || randomUUID(),
      request,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: 1
    }
    return new SDKOutboundBulkRequestEntity(initialState)
  }

  /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
  constructor (initialState: SDKOutboundBulkRequestState) {
    SDKOutboundBulkRequestEntity._validateRequest(initialState.request)
    // Modify request to add bulkTransactionId if undefined
    if (initialState.request.bulkTransactionId === undefined) {
      initialState.request.bulkTransactionId = initialState.id
    }
    super(initialState)
  }

  isAutoAcceptPartyEnabled (): boolean {
    return this._state.request.options.autoAcceptParty.enabled
  }

  isAutoAcceptQuoteEnabled (): boolean {
    return this._state.request.options.autoAcceptQuote.enabled
  }

  getAutoAcceptQuotePerTransferFeeLimits (): SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkPerTransferFeeLimit[] | undefined {
    return this._state.request.options.autoAcceptQuote.perTransferFeeLimits
  }

  getBulkExpiration (): string {
    return this._state.request.options.bulkExpiration
  }

  private static _validateRequest (request: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransferRequest): void {
    let requestSchema = SDKSchemeAdapter.Outbound.V2_0_0.Schemas.bulkTransferRequest
    const validate = ajv.compile(requestSchema)
    const validationResult = validate(request)
    if(!validationResult) {
      throw new ValidationError(validate.errors || [])
    }
  }

}
