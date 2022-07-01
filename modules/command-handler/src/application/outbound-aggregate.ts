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
    BulkTransactionEntityAlreadyExistsError,
     InvalidBulkTransactionEntityIdTypeError,
     NoSuchBulkTransactionEntityError,
 } from "./errors";
 import {IBulkTransactionEntityRepo} from "./infrastructure-interfaces/irepo";
 import {BulkTransactionEntity, BulkTransferRequest, BulkBatch} from "./types";
 
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

     //TODO: Additional
     //1. split into inboud and outbound aggregates
     //2. Add functions that correspond to cmds like ProcessSDKOutboundBulkRequest(pass kafka message), 
     //3. We need xxxMessage in addition to the xxxEntity with the domain event
     //message...add all the fields entity needs 
     //4. there will be domain event messages and command event messages
     //5. ProcessSDKOutboundBulkRequestCmdEvt

     //BulkTransactionEntity
     async createBulkTransactionEntity(bulkTransactionEntity: BulkTransactionEntity): Promise<string> {
         // To facilitate the creation of BulkTransferEntity, undefined/null ids are accepted and converted to empty strings
         // (so that random UUIds are generated when storing the accounts).
         if (bulkTransactionEntity.id === undefined || bulkTransactionEntity.id === null) { // TODO.
            bulkTransactionEntity.id = "";
         }
         // TODO.
         // To facilitate the creation of BulkTransferEntity, undefined/null balances are accepted and automatically calculated
         // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
         /*if (account.balance === undefined || account.balance === null) { // TODO.
             account.balance = account.creditBalance - account.debitBalance;
         }*/
         bulkTransactionEntity.validatebulkTransactionEntity(bulkTransactionEntity);
         try {
             if (bulkTransactionEntity.id === "") {
                 do {
                    bulkTransactionEntity.id = uuid.v4();
                 } while (await this.repo.BulkTransactionEntityExists(bulkTransactionEntity.id));
             }
             await this.repo.storeBulkTransferEntity(bulkTransactionEntity);
         } catch (e: unknown) { // TODO.
             if (!(e instanceof BulkTransactionEntityAlreadyExistsError)) {
                 this.logger.error(e);
             }
             throw e;
         }
         return bulkTransactionEntity.id;
     }
 
     async getBulkTransactionEntity(bulkTransactionEntityId: string): Promise<BulkTransactionEntity | null> {
         if (typeof bulkTransactionEntityId !== "string") { // TODO.
             throw new InvalidBulkTransactionEntityIdTypeError();
         }
         try {
             return await this.repo.getBulkTransactionEntity(bulkTransactionEntityId);
         } catch (e: unknown) { // TODO.
             this.logger.error(e);
             throw e;
         }
     }
 
     async getBulkTransactionEntries(): Promise<BulkTransactionEntity[]> {
         try {
             return await this.repo.getBulkTransactionEntries();
         } catch (e: unknown) { // TODO.
             this.logger.error(e);
             throw e;
         }
     }
 
     async deleteBulkTransactionEntity(bulkTransactionEntityId: string): Promise<void> {
         if (typeof bulkTransactionEntityId !== "string") { // TODO.
             throw new InvalidBulkTransactionEntityIdTypeError();
         }
         try {
             await this.repo.deleteBulkTransactionEntity(bulkTransactionEntityId);
         } catch (e: unknown) { // TODO.
             if (!(e instanceof NoSuchBulkTransactionEntityError)) {
                 this.logger.error(e);
             }
             throw e;
         }
     }
 
     async deleteBulkTransactionEntries(): Promise<void> {
         try {
             await this.repo.deleteBulkTransactionEntries();
         } catch (e: unknown) {
             this.logger.error(e);
             throw e;
         }
     }

     //BulkTransferRequest
     //TODO: Do we need to add an id to BulkTransferRequest?
     async createBulkTransferRequest(bulkTransferRequest: BulkTransferRequest): Promise<string> {
        // To facilitate the creation of BulkTransferRequest, undefined/null ids are accepted and converted to empty strings
        // (so that random UUIds are generated when storing the accounts).
        if (bulkTransferRequest.id === undefined || bulkTransferRequest.id === null) { // TODO.
            bulkTransferRequest.id = "";
        }
        // TODO.
        // To facilitate the creation of BulkTransferRequest, undefined/null balances are accepted and automatically calculated
        // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
        /*if (account.balance === undefined || account.balance === null) { // TODO.
            account.balance = account.creditBalance - account.debitBalance;
        }*/
        try {
            if (bulkTransferRequest.id === "") {
                do {
                    bulkTransferRequest.id = uuid.v4();
                } while (await this.repo.BulkTransferRequest(bulkTransferRequest.id));
            }
            await this.repo.storeBulkTransferRequest(bulkTransferRequest);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof bulkTransferRequest)) {
                this.logger.error(e);
            }
            throw e;
        }
        return bulkTransferRequest.id;
    }

    async getBulkTransferRequest(BulkTransferRequestId: string): Promise<BulkTransferRequest | null> {
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

    async getBulkTransferRequests(): Promise<BulkTransferRequest[]> {
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
     async createIndividualTransfers(IndividualTransfers: IndividualTransfers): Promise<string> {
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
     async createBulkBatch(bulkBatch: BulkBatch): Promise<string> {
        // To facilitate the creation of BulkBatch, undefined/null ids are accepted and converted to empty strings
        // (so that random UUIds are generated when storing the accounts).
        if (bulkBatch.id === undefined || bulkBatch.id === null) { // TODO.
            bulkBatch.id = "";
        }
        // TODO.
        // To facilitate the creation of BulkBatch, undefined/null balances are accepted and automatically calculated
        // based on the credit and debit balances provided (balance = creditBalance - debitBalance).
        /*if (account.balance === undefined || account.balance === null) { // TODO.
            account.balance = account.creditBalance - account.debitBalance;
        }*/
        try {
            if (bulkBatch.id === "") {
                do {
                    bulkBatch.id = uuid.v4();
                } while (await this.repo.BulkBatchExists(bulkBatch.id));
            }
            await this.repo.storeBulkBatch(bulkBatch);
        } catch (e: unknown) { // TODO.
            if (!(e instanceof BulkBatchAlreadyExistsError)) {
                this.logger.error(e);
            }
            throw e;
        }
        return bulkBatch.id;
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