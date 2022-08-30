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

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { BulkBatchState, BulkTransactionState, IndividualTransferState } from '../domain';
import { IBulkTransactionEntityRepo } from '../types/bulk_transaction_entity_repo';

export class InMemoryBulkTransactionStateRepo implements IBulkTransactionEntityRepo {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    private _data: any;

    private readonly _logger: ILogger;

    private _initialized = false;

    private readonly keyPrefix: string = 'outboundBulkTransaction_';

    private readonly individualTransferKeyPrefix: string = 'individualItem_';
    private readonly bulkBatchKeyPrefix: string = 'bulkBatch_';
    private readonly bulkQuotesTotalCountKey: string = 'bulkQuotesTotalCount';
    private readonly bulkQuotesSuccessCountKey: string = 'bulkQuotesSuccessCount';
    private readonly bulkQuotesFailedCountKey: string = 'bulkQuotesFailedCount';


    constructor(logger: ILogger) {
        this._logger = logger;
    }

    async init(): Promise<void> {
        this._data = {};
        this._initialized = true;
    }

    async destroy(): Promise<void> {
        if(this._initialized) { this._data = undefined; }
        return Promise.resolve();
    }

    canCall(): boolean {
        return this._initialized; // for now, no circuit breaker exists
    }

    async load(id: string): Promise<BulkTransactionState> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(id);
        try {

            const bulkTransactionEntityStateStr = this._data[key].bulkTransactionEntityState;
            if(bulkTransactionEntityStateStr) {
                return JSON.parse(bulkTransactionEntityStateStr);
            } else {
                this._logger.error('Error loading entity state from memory - for key: ' + key);
                throw (new Error('Error loading entity state from memory'));
            }
        } catch (err) {
            this._logger.error(err, 'Error loading entity state from memory - for key: ' + key);
            throw (err);
        }
    }

    async remove(id: string): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(id);
        try {
            delete this._data[key];
        } catch (err) {
            this._logger.error(err, 'Error removing entity state from memory - for key: ' + key);
            throw (err);
        }
    }

    async store(entityState: BulkTransactionState): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(entityState.id);
        try {
            this._data[key] = {
                id: entityState.id || '',
                bulkTransactionEntityState: JSON.stringify(entityState),
            };
        } catch (err) {
            this._logger.error(err, 'Error storing entity state to memory - for key: ' + key);
            throw (err);
        }
    }

    
    async getAllIndividualTransferIds(bulkId: string): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const allAttributes = Object.keys(this._data[key]);
            const allIndividualTransferIds = allAttributes.filter(attr => attr.startsWith(this.individualTransferKeyPrefix)).map(attr => attr.replace(this.individualTransferKeyPrefix, ''));
            return allIndividualTransferIds;
        } catch (err) {
            this._logger.error(err, 'Error getting individual transfers from memory - for key: ' + key);
            throw (err);
        }
    }

    async getIndividualTransfer(bulkId: string, individualTranferId: string): Promise<IndividualTransferState> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return JSON.parse(this._data[key][this.individualTransferKeyPrefix + individualTranferId]) as IndividualTransferState;
        } catch (err) {
            this._logger.error(err, 'Error getting individual tranfer from memory - for key: ' + key);
            throw (err);
        }
    }

    async setIndividualTransfer(
        bulkId: string,
        individualTranferId: string,
        value: IndividualTransferState,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.individualTransferKeyPrefix + individualTranferId] = JSON.stringify(value);
        } catch (err) {
            this._logger.error(err, `Error storing individual tranfer with ID ${individualTranferId} to memory for key: ${key}`);
            throw (err);
        }
    }

    async getAllBulkBatchIds(bulkId: string): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const allAttributes = Object.keys(this._data[key]);
            const allBulkBatchIds = allAttributes.filter(attr => attr.startsWith(this.bulkBatchKeyPrefix)).map(attr => attr.replace(this.bulkBatchKeyPrefix, ''));
            return allBulkBatchIds;
        } catch (err) {
            this._logger.error(err, 'Error getting bulk batches from memory - for key: ' + key);
            throw (err);
        }
    }

    async getBulkBatch(bulkId: string, bulkBatchId: string): Promise<BulkBatchState> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return JSON.parse(this._data[key][this.bulkBatchKeyPrefix + bulkBatchId]) as BulkBatchState;
        } catch (err) {
            this._logger.error(err, 'Error getting bulk batch from memory - for key: ' + key);
            throw (err);
        }
    }

    async setBulkBatch(
        bulkId: string,
        bulkBatchId: string,
        value: BulkBatchState,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkBatchKeyPrefix + bulkBatchId] = JSON.stringify(value);
        } catch (err) {
            this._logger.error(err, `Error storing bulk batch with ID ${bulkBatchId} to memory for key: ${key}`);
            throw (err);
        }
    }

    async isBulkIdExists(bulkId: string): Promise<boolean> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return this._data.hasOwnProperty(key);
        } catch (err) {
            this._logger.error(err, 'Error getting status from memory - for key: ' + key);
            throw (err);
        }
    }

    async getBulkQuotesTotalCount(bulkId: string): Promise<number> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const count = this._data[key][this.bulkQuotesTotalCountKey];
            if(count)
            {
                return Number(count);
            } else {
                this._logger.error(`Error loading ${this.bulkQuotesTotalCountKey} from memory - for key: ${key}`);
                throw(new Error(`Error loading ${this.bulkQuotesTotalCountKey} from memory - for key: ${key}`));
            }
        } catch (err) {
            this._logger.error(err, `Error loading ${this.bulkQuotesTotalCountKey} from memory - for key: ${key}`);
            throw (err);
        }      
    }
    async setBulkQuotesTotalCount(bulkId: string, value: number): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkQuotesTotalCountKey] = value;
        } catch (err) {
            this._logger.error(err, `Error storing attribute ${this.bulkQuotesTotalCountKey} to memory for key: ${key}`);
            throw (err);
        }
    }

    async getBulkQuotesSuccessCount(bulkId: string): Promise<number> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const count = this._data[key][this.bulkQuotesSuccessCountKey];
            if(count)
            {
                return Number(count);
            } else {
                this._logger.error(`Error loading ${this.bulkQuotesSuccessCountKey} from memory - for key: ${key}`);
                throw(new Error(`Error loading ${this.bulkQuotesSuccessCountKey} from memory - for key: ${key}`));
            }
        } catch (err) {
            this._logger.error(err, `Error loading ${this.bulkQuotesSuccessCountKey} from memory - for key: ${key}`);
            throw (err);
        }
    }
    async setBulkQuotesSuccessCount(bulkId: string, value: number): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkQuotesSuccessCountKey] = value;
        } catch (err) {
            this._logger.error(err, `Error storing attribute ${this.bulkQuotesSuccessCountKey} to memory for key: ${key}`);
            throw (err);
        }
    }
    async incrementBulkQuotesSuccessCount(bulkId: string): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkQuotesSuccessCountKey]++;
        } catch (err) {
            this._logger.error(err, `Error incrementing attribute ${this.bulkQuotesSuccessCountKey} in memory for key: ${key}`);
            throw (err);
        }
    }

    async getBulkQuotesFailedCount(bulkId: string): Promise<number> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const count = this._data[key][this.bulkQuotesFailedCountKey];
            if(count)
            {
                return Number(count);
            } else {
                this._logger.error(`Error loading ${this.bulkQuotesFailedCountKey} from memory - for key: ${key}`);
                throw(new Error(`Error loading ${this.bulkQuotesFailedCountKey} from memory - for key: ${key}`));
            }
        } catch (err) {
            this._logger.error(err, `Error loading ${this.bulkQuotesFailedCountKey} from memory - for key: ${key}`);
            throw (err);
        }
    }
    async setBulkQuotesFailedCount(bulkId: string, value: number): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkQuotesFailedCountKey] = value;
        } catch (err) {
            this._logger.error(err, `Error storing attribute ${this.bulkQuotesFailedCountKey} to memory for key: ${key}`);
            throw (err);
        }
    }
    async incrementBulkQuotesFailedCount(bulkId: string): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            this._data[key][this.bulkQuotesFailedCountKey]++;
        } catch (err) {
            this._logger.error(err, `Error incrementing attribute ${this.bulkQuotesFailedCountKey} in memory for key: ${key}`);
            throw (err);
        }
    }

    private keyWithPrefix(key: string): string {
        return this.keyPrefix + key;
    }

    // TODO: Just for development purpose for now, can be removed later
    async getAllBulkIds(): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        try {
            const allKeys =  Object.keys(this._data).filter(key => key.startsWith(this.keyPrefix));
            return allKeys.map(key => key.replace(this.keyPrefix, ''));
        } catch (err) {
            this._logger.error(err, 'Error getting all bulk transaction ids from memory');
            throw (err);
        }
    }

}
