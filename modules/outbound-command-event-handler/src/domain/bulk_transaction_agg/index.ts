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
 - Miguel de Barros <miguel.debarros@modusbox.com>
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
    IndividualTransferInternalState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

import CommandEventHandlerFunctions from './handlers';
import { ICommandEventHandlerOptions } from '@module-types';
import { randomUUID } from 'crypto';

type BatchMapArray = { [fspId: string]: string[][] };

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
        request: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionRequest,
        entityStateRepo: IEntityStateRepository<BulkTransactionState>,
        logger: ILogger,
    ): Promise<BulkTransactionAgg> {
        const aggLogger = logger.createChild(this.name);
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
        const agg = new BulkTransactionAgg(bulkTransactionEntity, entityStateRepo, aggLogger);
        // Persist in the rep
        await agg.store();
        // Create individualTransfer entities
        if(Array.isArray(request?.individualTransfers)) {
            // TODO: limit the number of concurrently created promises to avoid nodejs high memory consumption
            await Promise.all(
                request.individualTransfers.map(
                    (individualTransfer: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionIndividualTransfer) =>
                        agg.addIndividualTransferEntity(IndividualTransferEntity.CreateFromRequest(individualTransfer)),
                ),
            );
        }
        // Set initial values
        await agg.setBulkTransfersTotalCount(0);
        await agg.setBulkTransfersSuccessCount(0);
        await agg.setBulkTransfersFailedCount(0);
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
        const aggLogger = logger.createChild(this.name);
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
            const agg = new BulkTransactionAgg(bulkTransactionEntity, entityStateRepo, aggLogger);
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

    async getBulkTransfersTotalCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkTransfersTotalCount(this._rootEntity.id);
    }

    async setBulkTransfersTotalCount(totalCount: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkTransfersTotalCount(this._rootEntity.id, totalCount);
    }

    async getBulkTransfersSuccessCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkTransfersSuccessCount(this._rootEntity.id);
    }

    async getBulkTransfersFailedCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkTransfersFailedCount(this._rootEntity.id);
    }

    async setBulkTransfersSuccessCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkTransfersSuccessCount(this._rootEntity.id, count);
    }

    async setBulkTransfersFailedCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkTransfersFailedCount(this._rootEntity.id, count);
    }

    async incrementBulkTransfersSuccessCount(increment = 1) : Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementBulkTransfersSuccessCount(this._rootEntity.id, increment);
    }

    async incrementBulkTransfersFailedCount(increment = 1) : Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.incrementBulkTransfersFailedCount(this._rootEntity.id, increment);
    }

    async getBulkQuotesTotalCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesTotalCount(this._rootEntity.id);
    }

    async setBulkQuotesTotalCount(totalCount: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesTotalCount(this._rootEntity.id, totalCount);
    }

    async getBulkQuotesSuccessCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesSuccessCount(this._rootEntity.id);
    }

    async setBulkQuotesSuccessCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesSuccessCount(this._rootEntity.id, count);
    }

    async incrementBulkQuotesSuccessCount() : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .incrementBulkQuotesSuccessCount(this._rootEntity.id);
    }

    async getBulkQuotesFailedCount(): Promise<number> {
        const repo = this._entity_state_repo as IBulkTransactionEntityRepo;
        return repo.getBulkQuotesFailedCount(this._rootEntity.id);
    }

    async setBulkQuotesFailedCount(count: number) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkQuotesFailedCount(this._rootEntity.id, count);
    }

    async incrementBulkQuotesFailedCount() : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .incrementBulkQuotesFailedCount(this._rootEntity.id);
    }

    async addBulkBatchEntity(entity: BulkBatchEntity) : Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkBatch(this._rootEntity.id, entity.id, entity.exportState());
    }

    async setBulkBatchById(id: string, bulkBatch: BulkBatchEntity): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .setBulkBatch(this._rootEntity.id, id, bulkBatch.exportState());
    }

    // This function creates batch map array requests based per each DFSP and with maximum limit passed optionally filtered by individualTransfers that match the individualTransferInternalStateFilter
    private async _generateBatchMapArray(
        maxItemsPerBatch: number,
        individualTransferInternalStateFilter: IndividualTransferInternalState | null = null,
    ) : Promise<BatchMapArray> {
        const allBulkBatchIds = await this.getAllBulkBatchIds();
        if(allBulkBatchIds.length > 0) {
            throw (new Error('Bulk batches are already created on this aggregator'));
        }

        const batchesPerFsp: BatchMapArray = {};

        // Iterate through individual transfers
        const allIndividualTransferIds = await this.getAllIndividualTransferIds();
        for await (const individualTransferId of allIndividualTransferIds) {
            // Create the array of batches per each DFSP with maximum limit from the config containing Ids of individual transfers
            const individualTransfer = await this.getIndividualTransferById(individualTransferId);

            // Lets check if a filter is defined, and if it is and does not match the transferState then skip processing this individualTransfer
            if(
                individualTransferInternalStateFilter != null &&
                individualTransfer.transferState !== individualTransferInternalStateFilter
            ) {
                continue; // Skip processing
            }

            if(individualTransfer.toFspId) {
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

        return batchesPerFsp;
    }

    async generateBulkQuoteBatches(maxItemsPerBatch: number): Promise<{
        bulkQuotesTotalCount: number,
    }> {
        // lets make sure we have not already generated batches
        let getBulkQuotesTotalCountResult = 0;
        try {
            getBulkQuotesTotalCountResult = await this.getBulkQuotesTotalCount();
        } catch (err) {
            this._logger.warn(err);
        }

        if(getBulkQuotesTotalCountResult > 0) {
            throw new Error(`Unable to ${this.constructor.name}.generateBulkQuoteBatches() as BulkQuotesTotalCount (${getBulkQuotesTotalCountResult}) > 0`);
        }
        // Lets creates batch map array requests based per each DFSP and with maximum limit passed optionally filtered by individualTransfers that match the individualTransferInternalStateFilter
        const batchesPerFsp = await this._generateBatchMapArray(
            maxItemsPerBatch,
            IndividualTransferInternalState.DISCOVERY_ACCEPTED,
        );

        // Construct the batches per each element in the array
        let bulkQuotesTotalCount = 0;
        for await (const fspId of Object.keys(batchesPerFsp)) {
            for await (const individualIdArray of batchesPerFsp[fspId]) {
                const bulkBatch = BulkBatchEntity.CreateEmptyBatch(this._rootEntity);
                for await (const individualId of individualIdArray) {
                    const individualTransfer = await this.getIndividualTransferById(individualId);
                    const party = individualTransfer.partyResponse?.party;
                    if(party) {
                        // Generate Quote request
                        const individualBulkQuoteRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualQuote = {
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
                        };
                        this._logger.debug(`Generated Quote Request ${JSON.stringify(individualBulkQuoteRequest, null, 2)} for BulkBatch.bulkQuoteId=${bulkBatch.bulkQuoteId}`);
                        // Add Quotes to batch
                        bulkBatch.addIndividualQuote(
                            individualBulkQuoteRequest,
                            individualTransfer.id,
                        );
                    }
                }
                // TODO: should we not add the bulkQuoteRequest to the BulkTransaction.individualItem and update its status?
                await this.addBulkBatchEntity(bulkBatch);
                bulkQuotesTotalCount += 1;
            }
        }
        await this.setBulkQuotesTotalCount(bulkQuotesTotalCount);
        return {
            bulkQuotesTotalCount,
        };
    }

    // async generateBulkTransferBatches(batchesPerFspIdArray: string[]): Promise<{
    async generateBulkTransferBatches(): Promise<{
        bulkTransfersTotalCount: number,
    } | void> {
        // lets make sure we have not already generated batches
        let getBulkTransfersTotalCountResult = 0;
        try {
            getBulkTransfersTotalCountResult = await this.getBulkTransfersTotalCount();
        } catch (err) {
            this._logger.warn(err);
        }

        if(getBulkTransfersTotalCountResult > 0) {
            throw new Error(`Unable to ${this.constructor.name}.generateBulkTransferBatches() as BulkTransfersTotalCount (${getBulkTransfersTotalCountResult}) > 0`);
        }
        // Lets fetch the current BulkBatchId Array
        const batchesPerFspIdArray = await this.getAllBulkBatchIds();

        // Construct the batches per each element in the array
        let bulkTransfersTotalCount = 0;
        for await (const bulkBatchId of batchesPerFspIdArray) {
            const bulkBatch = await this.getBulkBatchEntityById(bulkBatchId);

            const individualQuoteResults = bulkBatch.bulkQuotesResponse?.individualQuoteResults; // TODO: Are we not missing the condition here?

            if(individualQuoteResults == null) continue; // TODO: how to handle this?

            for await (const individualQuoteResult of individualQuoteResults) {
                const individualTransferId = bulkBatch.getReferenceIdForQuoteId(individualQuoteResult.quoteId);
                const individualTransfer = await this.getIndividualTransferById(individualTransferId);
                const party = individualTransfer.partyResponse?.party;
                if(party) {
                    // Generate Transfers request
                    const individualBulkTransferRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.individualTransfer = {
                        transferId: individualTransfer.id,
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
                        extensions: individualTransfer.request.quoteExtensions,
                    }; // TODO: Why do we not have the CONDITION as part of the out-going Transfer Request?
                    this._logger.debug(`Generated Transfers Request ${JSON.stringify(individualBulkTransferRequest, null, 2)} for BulkBatch.bulkQuoteId=${bulkBatch.bulkQuoteId}`);
                    // Add Transfers to batch
                    bulkBatch.addIndividualTransfer(
                        individualBulkTransferRequest,
                        individualTransfer.id,
                    );
                }
                // Add Transfers to batch
                bulkTransfersTotalCount += 1;
            }
            // TODO: should we not add the bulkTransfersRequest to the BulkTransaction.individualItem and update its status?
            await this.setBulkBatchById(bulkBatch.id, bulkBatch);
            await this.setBulkTransfersTotalCount(bulkTransfersTotalCount);
        }
        return {
            bulkTransfersTotalCount,
        };
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
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .getPartyLookupTotalCount(this._rootEntity.id);
    }

    async getPartyLookupSuccessCount(): Promise<any> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .getPartyLookupSuccessCount(this._rootEntity.id);
    }

    async getPartyLookupFailedCount(): Promise<any> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .getPartyLookupFailedCount(this._rootEntity.id);
    }

    async incrementPartyLookupSuccessCount(increment = 1): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .incrementPartyLookupSuccessCount(this._rootEntity.id, increment);
    }

    async incrementPartyLookupFailedCount(increment = 1): Promise<void> {
        await (<IBulkTransactionEntityRepo> this._entity_state_repo)
            .incrementPartyLookupFailedCount(this._rootEntity.id, increment);
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
        const locallogger = logger.createChild(`${this.name}.ProcessCommandEvent`);
        const handlerPrefix = 'handle';
        if(!CommandEventHandlerFunctions.hasOwnProperty(handlerPrefix + message.constructor.name)) {
            locallogger.error(`Handler function for the command event message ${message.constructor.name} is not implemented`);
            return;
        }
        locallogger.info(`Calling ${handlerPrefix + message.constructor.name}`);
        const commandEventHandlerFunctionsLogger = logger.createChild(`${this.name}.${handlerPrefix}${message.constructor.name}`);
        await CommandEventHandlerFunctions[handlerPrefix + message.constructor.name](
            message,
            options,
            commandEventHandlerFunctionsLogger,
        );
    }

}
