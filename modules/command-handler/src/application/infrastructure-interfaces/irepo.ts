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

import {IBulkTransferEntity, BulkTransferRequest, IndividualTransfers, BulkBatch} from "@mojaloop/sdk-scheme-adapter-private-types"; // TODO: mbp-638

export interface IBulkTransferEntityRepo {
	init(): Promise<void>;
	destroy(): Promise<void>;
	// BulkTransferEntity
	bulkTransferEntityExists(bulkTransferEntityId: string): Promise<boolean>;
	storeBulkTransferEntity(bulkTransferEntity: IBulkTransferEntity): Promise<void>;
	getBulkTransferEntity(bulkTransferEntityId: string): Promise<IBulkTransferEntity | null>;
	updateBulkTransferEntity(bulkTransferEntity: IBulkTransferEntity): Promise<void>; // TODO: return value;
	deleteBulkTransferEntity(bulkTransferEntityId: string): Promise<void>;
	deleteBulkTransferEntities(): Promise<void>;
	// BulkTransferRequest
	bulkTransferRequestExists(bulkTransferRequestId: string): Promise<boolean>;
	storeBulkTransferRequest(bulkTransferRequest: BulkTransferRequest): Promise<void>;
	getBulkTransferRequest(bulkTransferRequestId: string): Promise<IBulkTransferEntity | null>;
	updateBulkTransferRequest(bulkTransferRequest: BulkTransferRequest): Promise<void>; // TODO: return value;
	deleteBulkTransferRequest(bulkTransferRequestId: string): Promise<void>;
	deleteBulkTransferRequests(): Promise<void>;
	// IndividualTransfers
	individualTransfersExists(individualTransfersId: string): Promise<boolean>;
	storeIndividualTransfers(individualTransfers: IndividualTransfers): Promise<void>;
	getIndividualTransfers(individualTransfersId: string): Promise<IBulkTransferEntity | null>;
	updateIndividualTransfers(individualTransfers: IndividualTransfers): Promise<void>; // TODO: return value;
	deleteIndividualTransfers(individualTransfersId: string): Promise<void>;
	deleteMultipleIndividualTransfers(): Promise<void>;
	// BulkBatch
	bulkBatchExists(individualTransfersId: string): Promise<boolean>;
	storeBulkBatch(bulkBatch: BulkBatch): Promise<void>;
	getBulkBatch(individualTransfersId: string): Promise<IBulkTransferEntity | null>;
	updateBulkBatch(bulkBatch: BulkBatch): Promise<void>; // TODO: return value;
	deleteBulkBatch(individualTransfersId: string): Promise<void>;
	deleteBulkBatches(): Promise<void>;		
}
