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
 - Shashikant Hirugade <shashikant.hirugade@modusbox.com>
 - Juan Correa <juancorrea@modusbox.com>

 --------------
 ******/

 "use strict";

 // Invalid Errors
 export class InvalidBulkTransactionEntityIdTypeError extends Error {}
 export class InvalidBulkTransactionEntityHomeTransactionIDTypeError extends Error {}
 export class InvalidBulkTransactionEntityRequestTypeError extends Error {}
 export class InvalidBulkTransactionEntityIndividualTransferTypeError extends Error {}
 export class InvalidBulkTransactionEntityStatusTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkBatchTypeError extends Error {}
 export class InvalidBulkTransactionEntityPartyLookupTotalCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityPartyLookupSuccessCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityPartyLookupFailedCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkQuotesTotalCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkQuotesSuccessCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkQuotesFailCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkTransferTotalCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkTransferSuccessCountTypeError extends Error {}
 export class InvalidBulkTransactionEntityBulkTransferFailCountTypeError extends Error {}

 // Repo.
 export class UnableToInitRepoError extends Error {}

 // Item already exists.
 export class BulkTransactionEntityAlreadyExistsError extends Error {}
 // No such item.
 export class NoSuchBulkTransactionEntityError extends Error {}
 // Stores.
 export class UnableToStoreBulkTransactionEntityError extends Error {}
 // Gets.
 export class UnableToGetBulkTransactionEntityError extends Error {}
 export class UnableToGetBulkTransactionEntitiesError extends Error {}
 // Updates.
 export class UnableToUpdateBulkTransactionEntityError extends Error {}
 // Deletes.
 export class UnableToDeleteBulkTransactionEntityError extends Error {}
 export class UnableToDeleteBulkTransactionEntitiesError extends Error {}
 
 // Others
 