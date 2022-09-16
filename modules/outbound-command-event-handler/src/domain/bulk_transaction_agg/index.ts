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
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    BaseAggregate,
    BulkTransactionEntity,
    BulkTransactionInternalState,
    BulkTransactionState,
    CommandEvent,
    IBulkTransactionEntityRepo,
    IEntityStateRepository,
    IndividualTransferEntity,
    IndividualTransferState,
    BulkBatchEntity,
    BulkBatchState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

import CommandEventHandlerFunctions from './handlers';
import { ICommandEventHandlerOptions } from '@module-types';
import { randomUUID } from 'crypto';


export class BulkTransactionAgg extends BaseAggregate<BulkTransactionEntity, BulkTransactionState> {
    // private _partyLookupTotalCount?: number;
    // private _partyLookupSuccessCount?: number;
    // private _partyLookupFailedCount?: number;
    // private _bulkQuotesTotalCount: number;
    // private _bulkQuotesSuccessCount: number;
    // private _bulkQuotesFailedCount: number;
    // private _bulkTransfersTotalCount: number;
    // private _bulkTransfersSuccessCount: number;
    // private _bulkTransfersFailedCount: number;

    // constructor(
    //   bulkTransactionEntity: BulkTransactionEntity,
    //   entityStateRepo: IEntityStateRepository<BulkTransactionState>,
    //   logger: ILogger
    // ) {
    //     super(bulkTransactionEntity, entityStateRepo, logger);
    // }

    static async CreateFromRequest(
        request: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest,
        entityStateRepo: IEntityStateRepository<BulkTransactionState>,
        logger: ILogger,
    ): Promise<BulkTransactionAgg> {
        const repo = entityStateRepo as IBulkTransactionEntityRepo;
        // Duplicate Check
        if(request.bulkTransactionId) {
            const isBulkIdExists = await repo.isBulkIdExists(request.bulkTransactionId);
            if(isBulkIdExists) {
                throw new Error('Duplicate: Aggregate already exists in repo');
            }
        }

        // Create root entity
        const bulkTransactionEntity = BulkTransactionEntity.CreateFromRequest(request);
        // Create the aggregate
        const agg = new BulkTransactionAgg(bulkTransactionEntity, entityStateRepo, logger);
        // Persist in the rep
        await agg.store();
        // Create individualTransfer entities
        if(Array.isArray(request?.individualTransfers)) {
            // TODO: limit the number of concurrently created promises to avoid nodejs high memory consumption
            await Promise.all(
                request.individualTransfers.map(
                    (individualTransfer: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionIndividualTransfer) =>
                        agg.addIndividualTransferEntity(IndividualTransferEntity.CreateFromRequest(individualTransfer)),
                ),
            );
        }
        // Set initial values
        await agg.setBulkQuotesTotalCount(0);
        await agg.setBulkQuotesSuccessCount(0);
        await agg.setBulkQuotesFailedCount(0);
        await agg.setPartyLookupTotalCount(0);
        await agg.setPartyLookupSuccessCount(0);
        await agg.setPartyLookupFailedCount(0);

        // Return the aggregate
        return agg;
    }

    static async CreateFromRepo(
        id: string,
        entityStateRepo: IEntityStateRepository<BulkTransactionState>,
        logger: ILogger,
    ): Promise<BulkTransactionAgg> {
    // Get the root entity state from repo
        let state: BulkTransactionState | null;
        try {
            state = await entityStateRepo.load(id);
        } catch (err) {
            throw new Error('Aggregate data is not found in repo');
        }
        if(state) {
            // Create root entity
            const bulkTransactionEntity = new BulkTransactionEntity(state);
            // Create the aggregate
            const agg = new BulkTransactionAgg(bulkTransactionEntity, entityStateRepo, logger);
            // Return the aggregate
            return agg;
        } else {
            throw new Error('Aggregate data is not found in repo');
        }
    }

    get bulkId() {
        return this._rootEntity.id;
    }

    async getAllIndividualTransferIds() {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getAllIndividualTransferIds(this._rootEntity.id);
    }

    async getIndividualTransferById(id: string): Promise<IndividualTransferEntity> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        const state: IndividualTransferState = await repo.getIndividualTransfer(this._rootEntity.id, id);
        return new IndividualTransferEntity(state);
    }

    async setIndividualTransferById(id: string, transfer: IndividualTransferEntity): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setIndividualTransfer(this._rootEntity.id, id, transfer.exportState());
    }

    async setTransaction(tx: BulkTransactionEntity): Promise<void> {
        this._rootEntity = tx;
        await this.store();
    }

    async setGlobalState(state: BulkTransactionInternalState) : Promise<void> {
        this._rootEntity.setTxState(state);
        this._logger.info(`Setting global state of bulk transaction ${this._rootEntity.id} to ${state}`);
        await this.store();
    }

    isSkipPartyLookupEnabled() {
        return this._rootEntity.isSkipPartyLookupEnabled();
    }

    isAutoAcceptPartyEnabled() {
        return this._rootEntity.isAutoAcceptPartyEnabled();
    }

    async getAllBulkBatchIds() {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getAllBulkBatchIds(this._rootEntity.id);
    }

    async getBulkBatchEntityById(id: string): Promise<BulkBatchEntity> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        const state: BulkBatchState = await repo.getBulkBatch(this._rootEntity.id, id);
        return new BulkBatchEntity(state);
    }

    getBulkTransaction(): BulkTransactionEntity {
        return this._rootEntity;
    }

    async addIndividualTransferEntity(entity: IndividualTransferEntity) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setIndividualTransfer(this._rootEntity.id, entity.id, entity.exportState());
    }

    async getBulkQuotesTotalCount() {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesTotalCount(this._rootEntity.id);
    }

    async setBulkQuotesTotalCount(totalCount: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesTotalCount(this._rootEntity.id, totalCount);
    }

    async getBulkQuotesSuccessCount() {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesSuccessCount(this._rootEntity.id);
    }

    async setBulkQuotesSuccessCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesSuccessCount(this._rootEntity.id, count);
    }

    async incrementBulkQuotesSuccessCount(increment = 1) : Promise<void> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementBulkQuotesSuccessCount(this._rootEntity.id, increment);
    }

    async getBulkQuotesFailedCount() {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesFailedCount(this._rootEntity.id);
    }

    async setBulkQuotesFailedCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesFailedCount(this._rootEntity.id, count);
    }

    async incrementBulkQuotesFailedCount(increment = 1) : Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementBulkQuotesFailedCount(this._rootEntity.id, increment);
    }

    async addBulkBatchEntity(entity: BulkBatchEntity) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkBatch(this._rootEntity.id, entity.id, entity.exportState());
    }

    async setBulkBatchById(id: string, bulkBatch: BulkBatchEntity): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkBatch(this._rootEntity.id, id, bulkBatch.exportState());
    }

    // This function creates batches which contain bulkQuotes and bulkTransfer requests based per each DFSP and with maximum limit passed.
    async createBatches(maxItemsPerBatch: number) : Promise<void> {
        const allBulkBatchIds = await this.getAllBulkBatchIds();
        if(allBulkBatchIds.length > 0) {
            throw (new Error('Bulk batches are already created on this aggregator'));
        }

        const batchesPerFsp: { [fspId: string]: string[][] } = {};
        // Iterate through individual transfers
        const allIndividualTransferIds = await this.getAllIndividualTransferIds();
        for await (const individualTransferId of allIndividualTransferIds) {
            // Create the array of batches per each DFSP with maximum limit from the config containing Ids of individual transfers
            const individualTransfer = await this.getIndividualTransferById(individualTransferId);
            if(individualTransfer.transferState === 'DISCOVERY_ACCEPTED' && individualTransfer.toFspId) {
                // If there is any element with fspId
                if(batchesPerFsp[individualTransfer.toFspId]) {
                    const batchFspIdArray = batchesPerFsp[individualTransfer.toFspId];
                    const batchFspLength = batchFspIdArray.length;
                    const lastElement = batchFspIdArray[batchFspLength - 1];
                    // If the length reaches maximum value, create new element and insert the id
                    if(lastElement.length < maxItemsPerBatch) {
                        lastElement.push(individualTransfer.id);
                    } else {
                        const newElement = [ individualTransfer.id ];
                        batchFspIdArray.push(newElement);
                    }
                } else {
                    const newElement = [ individualTransfer.id ];
                    batchesPerFsp[individualTransfer.toFspId] = [];
                    batchesPerFsp[individualTransfer.toFspId].push(newElement);
                }
            } else {
                this._logger.error(`The individual transfer with id ${individualTransfer.id} is not in state DISCOVERY_ACCEPTED or toFspId is not found in the partyResponse`);
            }
        }
        // console.log(batchesPerFsp);
        // Construct the batches per each element in the array
        let bulkQuotesTotalCount = 0;
        for await (const fspId of Object.keys(batchesPerFsp)) {
            for await (const individualIdArray of batchesPerFsp[fspId]) {
                const bulkBatch = BulkBatchEntity.CreateEmptyBatch(this._rootEntity);
                for await (const individualId of individualIdArray) {
                    const individualTransfer = await this.getIndividualTransferById(individualId);
                    const party = individualTransfer.partyResponse?.party;
                    if(party) {
                        // Add Quotes to batch
                        bulkBatch.addIndividualQuote({
                            quoteId: randomUUID(),
                            to: {
                                idType: party.partyIdInfo.partyIdType,
                                idValue: party.partyIdInfo.partyIdentifier,
                                idSubValue: party.partyIdInfo.partySubIdOrType,
                                displayName: party.name,
                                firstName: party.personalInfo?.complexName?.firstName,
                                middleName: party.personalInfo?.complexName?.middleName,
                                lastName: party.personalInfo?.complexName?.lastName,
                                dateOfBirth: party.personalInfo?.dateOfBirth,
                                merchantClassificationCode: party.merchantClassificationCode,
                                fspId: party.partyIdInfo.fspId,
                                extensionList: party.partyIdInfo.extensionList?.extension,
                            },
                            amountType: individualTransfer.request.amountType,
                            currency: individualTransfer.request.currency,
                            amount: individualTransfer.request.amount,
                            transactionType: 'TRANSFER',
                            note: individualTransfer.request.note,
                            extensions: individualTransfer.request.quoteExtensions,
                        },
                        individualTransfer.id);
                        // TODO: Add Transfers to batch here like the quotes above
                    }

                }
                await this.addBulkBatchEntity(bulkBatch);
                bulkQuotesTotalCount += 1;
            }
        }
        await this.setBulkQuotesTotalCount(bulkQuotesTotalCount);

    }

    async setPartyLookupTotalCount(count: number): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setPartyLookupTotalCount(this._rootEntity.id, count);
    }

    async setPartyLookupSuccessCount(count: number): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setPartyLookupSuccessCount(this._rootEntity.id, count);
    }

    async setPartyLookupFailedCount(count: number): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setPartyLookupFailedCount(this._rootEntity.id, count);
    }

    async getPartyLookupTotalCount(): Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getPartyLookupTotalCount(this._rootEntity.id);
    }

    async getPartyLookupSuccessCount(): Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getPartyLookupSuccessCount(this._rootEntity.id);
    }

    async getPartyLookupFailedCount(): Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getPartyLookupFailedCount(this._rootEntity.id);
    }

    async incrementPartyLookupSuccessCount(increment = 1): Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementPartyLookupSuccessCount(this._rootEntity.id, increment);
    }

    async incrementPartyLookupFailedCount(increment = 1): Promise<any> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementPartyLookupFailedCount(this._rootEntity.id, increment);
    }

    async destroy() : Promise<void> {
        if(this._rootEntity) {
            // Cleanup repo
            await this._entity_state_repo.remove(this._rootEntity.id);
            // Cleanup properties
            // this._rootEntity = null
            // this._partyLookupTotalCount = undefined;
            // this._partyLookupSuccessCount = undefined;
            // this._partyLookupFailedCount = undefined;
        }
    }


    static async ProcessCommandEvent(
        message: CommandEvent,
        options: ICommandEventHandlerOptions,
        logger: ILogger,
    ) {
        const handlerPrefix = 'handle';
        if(!CommandEventHandlerFunctions.hasOwnProperty(handlerPrefix + message.constructor.name)) {
            logger.error(`Handler function for the command event message ${message.constructor.name} is not implemented`);
            return;
        }
        await CommandEventHandlerFunctions[handlerPrefix + message.constructor.name](
            message,
            options,
            logger,
        );
    }

}
