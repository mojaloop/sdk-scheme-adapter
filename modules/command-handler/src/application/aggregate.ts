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

 import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
 import * as uuid from "uuid";
 import {
    BulkTransferEntityAlreadyExistsError,
     InvalidBulkTransferEntityIdTypeError,
     NoSuchBulkTransferEntityError,
 } from "./errors";
 import {IBulkTransferEntityRepo} from "./infrastructure-interfaces/irepo";
 import {BulkTransferEntity, BulkTransferRequest, BulkBatch} from "./types";
 
 export class Aggregate {
     // Properties received through the constructor.
     private readonly logger: ILogger;
     private readonly repo: IRepo;
     // Other properties.
 
     constructor(
         logger: ILogger,
         repo: IRepo
     ) {
         this.logger = logger;
         this.repo = repo;
     }

     async init(): Promise<void> {
		try {
			await this.repo.init();
		} catch (e: unknown) {
			this.logger.fatal(e);
			throw e; // No need to be specific.
		}
	}

	async destroy(): Promise<void> {
		await this.repo.destroy();
	}

     // TODO: Add update
 
     //BulkTransferEntity
     async createBulkTransferEntity(BulkTransferEntity: BulkTransferEntity): Promise<string> { // TODO: BulkTransferEntity or IBulkTransferEntity?
         // To facilitate the creation of BulkTransferEntity, undefined/null ids are accepted and converted to empty strings
         // (so that random UUIds are generated when storing the accounts).
         if (BulkTransferEntity.id === undefined || BulkTransferEntity.id === null) { // TODO.
            BulkTransferEntity.id = "";
         }
         // TODO.
         // To facilitate the creation of BulkTransferEntity, undefined/null balances are accepted and automatically calculated
         // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
         /*if (account.balance === undefined || account.balance === null) { // TODO.
             account.balance = account.creditBalance - account.debitBalance;
         }*/
         BulkTransferEntity.validatebulkTransferEntity(BulkTransferEntity);
         try {
             if (BulkTransferEntity.id === "") {
                 do {
                    BulkTransferEntity.id = uuid.v4();
                 } while (await this.repo.BulkTransferEntityExists(BulkTransferEntity.id));
             }
             await this.repo.storeBulkTransferEntity(BulkTransferEntity);
         } catch (e: unknown) { // TODO.
             if (!(e instanceof BulkTransferEntityAlreadyExistsError)) {
                 this.logger.error(e);
             }
             throw e;
         }
         return BulkTransferEntity.id;
     }
 
     async getBulkTransferEntity(BulkTransferEntityId: string): Promise<BulkTransferEntity | null> { // TODO: BulkTransferEntity or IBulkTransferEntity?
         if (typeof BulkTransferEntityId !== "string") { // TODO.
             throw new InvalidBulkTransferEntityIdTypeError();
         }
         try {
             return await this.repo.getBulkTransferEntity(BulkTransferEntityId);
         } catch (e: unknown) { // TODO.
             this.logger.error(e);
             throw e;
         }
     }
 
     async getBulkTransferEntries(): Promise<BulkTransferEntity[]> { // TODO: BulkTransferEntity or IBulkTransferEntity?
         try {
             return await this.repo.getBulkTransferEntries();
         } catch (e: unknown) { // TODO.
             this.logger.error(e);
             throw e;
         }
     }
 
     async deleteBulkTransferEntity(BulkTransferEntityId: string): Promise<void> {
         if (typeof BulkTransferEntityId !== "string") { // TODO.
             throw new InvalidBulkTransferEntityIdTypeError();
         }
         try {
             await this.repo.deleteBulkTransferEntity(BulkTransferEntityId);
         } catch (e: unknown) { // TODO.
             if (!(e instanceof NoSuchBulkTransferEntityError)) {
                 this.logger.error(e);
             }
             throw e;
         }
     }
 
     async deleteBulkTransferEntries(): Promise<void> {
         try {
             await this.repo.deleteBulkTransferEntries();
         } catch (e: unknown) {
             this.logger.error(e);
             throw e;
         }
     }

     //BulkTransferRequest
     async createBulkTransferRequest(BulkTransferRequest: BulkTransferRequest): Promise<string> { // TODO: BulkTransferRequest or BulkTransferRequest?
        // To facilitate the creation of BulkTransferRequest, undefined/null ids are accepted and converted to empty strings
        // (so that random UUIds are generated when storing the accounts).
        if (BulkTransferRequest.id === undefined || BulkTransferRequest.id === null) { // TODO.
            BulkTransferRequest.id = "";
        }
        // TODO.
        // To facilitate the creation of BulkTransferRequest, undefined/null balances are accepted and automatically calculated
        // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
        /*if (account.balance === undefined || account.balance === null) { // TODO.
            account.balance = account.creditBalance - account.debitBalance;
        }*/
        BulkTransferRequest.validateBulkTransferRequest(BulkTransferRequest);
        try {
            if (BulkTransferRequest.id === "") {
                do {
                    BulkTransferRequest.id = uuid.v4();
                } while (await this.repo.BulkTransferRequest(BulkTransferRequest.id));
            }
            await this.repo.storeBulkTransferRequest(BulkTransferRequest);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof BulkTransferRequest)) {
                this.logger.error(e);
            }
            throw e;
        }
        return BulkTransferRequest.id;
    }

    async getBulkTransferRequest(BulkTransferRequestId: string): Promise<BulkTransferRequest | null> { // TODO: BulkTransferRequest or BulkTransferRequest?
        if (typeof BulkTransferRequestId !== "string") { // TODO.
            throw new InvalidBulkTransferRequestIdTypeError();
        }
        try {
            return await this.repo.getBulkTransferRequest(BulkTransferRequestId);
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async getBulkTransferRequests(): Promise<BulkTransferRequest[]> { // TODO: BulkTransferRequest or BulkTransferRequest?
        try {
            return await this.repo.getBulkTransferRequests();
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async deleteBulkTransferRequest(BulkTransferRequestId: string): Promise<void> {
        if (typeof BulkTransferRequestId !== "string") { // TODO.
            throw new InvalidBulkTransferRequestIdTypeError();
        }
        try {
            await this.repo.deleteBulkTransferRequest(BulkTransferRequestId);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof NoSuchBulkTransferRequestError)) {
                this.logger.error(e);
            }
            throw e;
        }
    }

    async deleteBulkTransferRequests(): Promise<void> {
        try {
            await this.repo.deleteBulkTransferRequests();
        } catch (e: unknown) {
            this.logger.error(e);
            throw e;
        }
    }

     //IndividualTransfers
     async createIndividualTransfers(IndividualTransfers: IndividualTransfers): Promise<string> { // TODO: IndividualTransfers or IndividualTransfers?
        // To facilitate the creation of IndividualTransfers, undefined/null ids are accepted and converted to empty strings
        // (so that random UUIds are generated when storing the accounts).
        if (IndividualTransfers.id === undefined || IndividualTransfers.id === null) { // TODO.
            IndividualTransfers.id = "";
        }
        // TODO.
        // To facilitate the creation of IndividualTransfers, undefined/null balances are accepted and automatically calculated
        // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
        /*if (account.balance === undefined || account.balance === null) { // TODO.
            account.balance = account.creditBalance - account.debitBalance;
        }*/
        IndividualTransfers.validateIndividualTransfers(IndividualTransfers);
        try {
            if (IndividualTransfers.id === "") {
                do {
                    IndividualTransfers.id = uuid.v4();
                } while (await this.repo.IndividualTransfers(IndividualTransfers.id));
            }
            await this.repo.storeIndividualTransfers(IndividualTransfers);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof IndividualTransfers)) {
                this.logger.error(e);
            }
            throw e;
        }
        return IndividualTransfers.id;
    }

    async getIndividualTransfers(IndividualTransfersId: string): Promise<IndividualTransfers | null> {
        if (typeof IndividualTransfersId !== "string") { // TODO.
            throw new InvalidIndividualTransfersIdTypeError();
        }
        try {
            return await this.repo.getIndividualTransfers(IndividualTransfersId);
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async getMultipleIndividualTransfers(): Promise<IndividualTransfers[]> {
        try {
            return await this.repo.getIndividualTransferss();
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async deleteIndividualTransfers(IndividualTransfersId: string): Promise<void> {
        if (typeof IndividualTransfersId !== "string") { // TODO.
            throw new InvalidIndividualTransfersIdTypeError();
        }
        try {
            await this.repo.deleteIndividualTransfers(IndividualTransfersId);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof NoSuchIndividualTransfersError)) {
                this.logger.error(e);
            }
            throw e;
        }
    }

    async deleteMultipleIndividualTransfers(): Promise<void> {
        try {
            await this.repo.deleteMultipleIndividualTransfers();
        } catch (e: unknown) {
            this.logger.error(e);
            throw e;
        }
    }

     //BulkBatch
     async createBulkBatch(BulkBatch: BulkBatch): Promise<string> {
        // To facilitate the creation of BulkBatch, undefined/null ids are accepted and converted to empty strings
        // (so that random UUIds are generated when storing the accounts).
        if (BulkBatch.id === undefined || BulkBatch.id === null) { // TODO.
            BulkBatch.id = "";
        }
        // TODO.
        // To facilitate the creation of BulkBatch, undefined/null balances are accepted and automatically calculated
        // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
        /*if (account.balance === undefined || account.balance === null) { // TODO.
            account.balance = account.creditBalance - account.debitBalance;
        }*/
        BulkBatch.validateBulkBatch(BulkBatch);
        try {
            if (BulkBatch.id === "") {
                do {
                    BulkBatch.id = uuid.v4();
                } while (await this.repo.BulkBatchExists(BulkBatch.id));
            }
            await this.repo.storeBulkBatch(BulkBatch);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof BulkBatchAlreadyExistsError)) {
                this.logger.error(e);
            }
            throw e;
        }
        return BulkBatch.id;
    }

    async getBulkBatch(BulkBatchId: string): Promise<BulkBatch | null> {
        if (typeof BulkBatchId !== "string") { // TODO.
            throw new InvalidBulkBatchIdTypeError();
        }
        try {
            return await this.repo.getBulkBatch(BulkBatchId);
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async getBulkBatches(): Promise<BulkBatch[]> {
        try {
            return await this.repo.getBulkBatches();
        } catch (e: unknown) { // TODO.
            this.logger.error(e);
            throw e;
        }
    }

    async deleteBulkBatch(BulkBatchId: string): Promise<void> {
        if (typeof BulkBatchId !== "string") { // TODO.
            throw new InvalidBulkBatchIdTypeError();
        }
        try {
            await this.repo.deleteBulkBatch(BulkBatchId);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof NoSuchBulkBatchError)) {
                this.logger.error(e);
            }
            throw e;
        }
    }

    async deleteBulkBatches(): Promise<void> {
        try {
            await this.repo.deleteBulkBatches();
        } catch (e: unknown) {
            this.logger.error(e);
            throw e;
        }
    }    
    
 }