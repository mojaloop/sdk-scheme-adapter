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
 - Miguel de Barros <miguel.debarros@modusbox.com>
 --------------
 ******/

'use strict';

import * as redis from 'redis';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { BulkBatchState, BulkTransactionState, IndividualTransferState } from '@module-domain';
import { IBulkTransactionEntityRepo } from '@module-types';

export interface IRedisBulkTransactionStateRepoOptions {
    connStr: string;
}

export class RedisBulkTransactionStateRepo implements IBulkTransactionEntityRepo {
    protected _redisClient!: redis.RedisClientType;

    private readonly _redisConnStr: string;

    private readonly _logger: ILogger;

    private _initialized = false;

    private readonly keyPrefix: string = 'outboundBulkTransaction_';

    private readonly individualTransferKeyPrefix: string = 'individualItem_';

    private readonly bulkBatchKeyPrefix: string = 'bulkBatch_';

    private readonly bulkTransfersTotalCountKey: string = 'bulkTransfersTotalCount';

    private readonly bulkTransfersSuccessCountKey: string = 'bulkTransfersSuccessCount';

    private readonly bulkTransfersFailedCountKey: string = 'bulkTransfersFailedCount';

    private readonly bulkQuotesTotalCountKey: string = 'bulkQuotesTotalCount';

    private readonly bulkQuotesSuccessCountKey: string = 'bulkQuotesSuccessCount';

    private readonly bulkQuotesFailedCountKey: string = 'bulkQuotesFailedCount';

    private readonly partyLookupTotalCountKey = 'partyLookupTotalCount';

    private readonly partyLookupSuccessCountKey = 'partyLookupSuccessCount';

    private readonly partyLookupFailedCountKey = 'partyLookupFailedCount';

    constructor(options: IRedisBulkTransactionStateRepoOptions, logger: ILogger) {
        this._redisConnStr = options.connStr;
        this._logger = logger;
    }

    async init(): Promise<void> {
        this._redisClient = redis.createClient({ url: this._redisConnStr });
        this._redisClient.on('error', err => {
            this._logger.error(err, 'Error connecting to redis server: ' + err.message);
            if(!this._initialized) {
                throw (err);
            }
        });
        await this._redisClient.connect();
        this._initialized = true;
    }

    async destroy(): Promise<void> {
        if(this._initialized) { await this._redisClient.quit(); }
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
            const bulkTransactionEntityStateStr = await this._redisClient.hGet(key, 'bulkTransactionEntityState');
            if(bulkTransactionEntityStateStr) {
                return JSON.parse(bulkTransactionEntityStateStr);
            } else {
                this._logger.error('Error loading entity state from redis - for key: ' + key);
                throw (new Error('Error loading entity state from redis'));
            }
        } catch (err) {
            this._logger.error(err, 'Error loading entity state from redis - for key: ' + key);
            throw (err);
        }
    }

    async remove(id: string): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(id);
        try {
            await this._redisClient.del(key);
        } catch (err) {
            this._logger.error(err, 'Error removing entity state from redis - for key: ' + key);
            throw (err);
        }
    }

    async store(entityState: BulkTransactionState): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(entityState.id);
        try {
            await this._redisClient
                .multi()
                .hSet(key, 'id', entityState.id || '')
                .hSet(key, 'bulkTransactionEntityState', JSON.stringify(entityState))
                .exec();
        } catch (err) {
            this._logger.error(err, 'Error storing entity state to redis - for key: ' + key);
            throw (err);
        }
    }

    async getAllIndividualTransferIds(bulkId: string): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const allAttributes = await this._redisClient.hKeys(key);
            const allIndividualTransferIds =
                allAttributes.filter(attr => attr.startsWith(this.individualTransferKeyPrefix)).map(attr => attr.replace(this.individualTransferKeyPrefix, ''));
            return allIndividualTransferIds;
        } catch (err) {
            this._logger.error(err, 'Error getting individual transfers from redis - for key: ' + key);
            throw (err);
        }
    }

    async getIndividualTransfer(bulkId: string, individualTransferId: string): Promise<IndividualTransferState> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const individualTransferStateStr =
                await this._redisClient.hGet(key, this.individualTransferKeyPrefix + individualTransferId);
            if(individualTransferStateStr) {
                return JSON.parse(individualTransferStateStr) as IndividualTransferState;
            } else {
                this._logger.error('Error loading individual transfer from redis - for key: ' + key);
                throw (new Error('Error loading individual transfer from redis'));
            }
        } catch (err) {
            this._logger.error(err, 'Error loading individual transfer from redis - for key: ' + key);
            throw (err);
        }
    }

    async setIndividualTransfer(
        bulkId: string,
        individualTransferId: string,
        value: IndividualTransferState,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            await this._redisClient.hSet(
                key,
                this.individualTransferKeyPrefix + individualTransferId,
                JSON.stringify(value),
            );
        } catch (err) {
            this._logger.error(err, `Error storing individual transfer with ID ${individualTransferId} to redis for key: ${key}`);
            throw (err);
        }
    }

    async getAllBulkBatchIds(bulkId: string): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const allAttributes = await this._redisClient.hKeys(key);
            const allBulkBatchIds = allAttributes.filter(attr => attr.startsWith(this.bulkBatchKeyPrefix)).map(attr => attr.replace(this.bulkBatchKeyPrefix, ''));
            return allBulkBatchIds;
        } catch (err) {
            this._logger.error(err, 'Error getting bulk batches from redis - for key: ' + key);
            throw (err);
        }
    }

    async getBulkBatch(bulkId: string, bulkBatchId: string): Promise<BulkBatchState> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const bulkBatchStateStr = await this._redisClient.hGet(key, this.bulkBatchKeyPrefix + bulkBatchId);
            if(bulkBatchStateStr) {
                return JSON.parse(bulkBatchStateStr) as BulkBatchState;
            } else {
                this._logger.error('Error loading bulk batch from redis - for key: ' + key);
                throw (new Error('Error loading bulk batch from redis'));
            }
        } catch (err) {
            this._logger.error(err, 'Error loading bulk batch from redis - for key: ' + key);
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
            await this._redisClient.hSet(key, this.bulkBatchKeyPrefix + bulkBatchId, JSON.stringify(value));
        } catch (err) {
            this._logger.error(err, `Error storing bulk batch with ID ${bulkBatchId} to redis for key: ${key}`);
            throw (err);
        }
    }

    async isBulkIdExists(bulkId: string): Promise<boolean> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const isExists = await this._redisClient.exists(key);
            return isExists === 1;
        } catch (err) {
            this._logger.error(err, 'Error getting status from redis - for key: ' + key);
            throw (err);
        }
    }

    // Generic private method to getCount by keyType
    private async _getCount(
        keyType: string,
        bulkId: string,
    ): Promise<number> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const count = await this._redisClient.hGet(key, keyType);
            if(count) {
                return Number(count);
            } else {
                this._logger.error(`Error loading ${keyType} from redis - for key: ${key}`);
                throw (new Error(`Error loading ${keyType} from redis - for key: ${key}`));
            }
        } catch (err) {
            this._logger.error(err, `Error loading ${keyType} from redis - for key: ${key}`);
            throw (err);
        }
    }

    // Generic private method to setCount by keyType
    private async _setCount(
        keyType: string,
        bulkId: string,
        value: number,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            await this._redisClient.hSet(key, keyType, value);
        } catch (err) {
            this._logger.error(err, `Error storing attribute ${keyType} to redis for key: ${key}`);
            throw (err);
        }
    }

    // Generic private method to incrementCount by keyType
    private async _incrementCount(
        keyType: string,
        bulkId: string,
        increment = 1,
    ): Promise<number> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            const count = await this._redisClient.hIncrBy(key, keyType, increment);
            if(count) {
                return Number(count);
            } else {
                this._logger.error(`Error loading ${keyType} from redis - for key: ${key}`);
                throw (new Error(`Error loading ${keyType} from redis - for key: ${key}`));
            }
        } catch (err) {
            this._logger.error(err, `Error incrementing attribute ${keyType} in redis for key: ${key}`);
            throw (err);
        }
    }

    async getBulkTransfersTotalCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkTransfersTotalCountKey, bulkId);
    }

    async setBulkTransfersTotalCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.bulkTransfersTotalCountKey, bulkId, value);
    }


    async getBulkTransfersSuccessCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkTransfersSuccessCountKey, bulkId);
    }

    async setBulkTransfersSuccessCount(bulkId: string, value: number): Promise<void> {
        return this._setCount(this.bulkTransfersSuccessCountKey, bulkId, value);
    }

    async incrementBulkTransfersSuccessCount(bulkId: string, increment = 1): Promise<number> {
        return this._incrementCount(this.bulkTransfersSuccessCountKey, bulkId, increment);
    }

    async incrementBulkTransfersFailedCount(bulkId: string, increment = 1): Promise<number> {
        return this._incrementCount(this.bulkTransfersFailedCountKey, bulkId, increment);
    }

    async getBulkTransfersFailedCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkTransfersFailedCountKey, bulkId);
    }

    async setBulkTransfersFailedCount(bulkId: string, value: number): Promise<void> {
        return this._setCount(this.bulkTransfersFailedCountKey, bulkId, value);
    }

    async getBulkQuotesTotalCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkQuotesTotalCountKey, bulkId);
    }

    async setBulkQuotesTotalCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.bulkQuotesTotalCountKey, bulkId, value);
    }

    async getBulkQuotesSuccessCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkQuotesSuccessCountKey, bulkId);
    }

    async setBulkQuotesSuccessCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.bulkQuotesSuccessCountKey, bulkId, value);
    }

    async incrementBulkQuotesSuccessCount(bulkId: string, increment = 1): Promise<number> {
        return this._incrementCount(this.bulkQuotesSuccessCountKey, bulkId, increment);
    }

    async getBulkQuotesFailedCount(bulkId: string): Promise<number> {
        return this._getCount(this.bulkQuotesFailedCountKey, bulkId);
    }

    async setBulkQuotesFailedCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.bulkQuotesFailedCountKey, bulkId, value);
    }

    async incrementBulkQuotesFailedCount(bulkId: string, increment = 1): Promise<number> {
        return this._incrementCount(this.bulkQuotesFailedCountKey, bulkId, increment);
    }

    async setPartyLookupTotalCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.partyLookupTotalCountKey, bulkId, value);
    }

    async setPartyLookupSuccessCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.partyLookupSuccessCountKey, bulkId, value);
    }

    async setPartyLookupFailedCount(
        bulkId: string,
        value: number,
    ): Promise<void> {
        return this._setCount(this.partyLookupFailedCountKey, bulkId, value);
    }

    async getPartyLookupTotalCount(bulkId: string): Promise<number> {
        return this._getCount(this.partyLookupTotalCountKey, bulkId);
    }

    async getPartyLookupSuccessCount(bulkId: string): Promise<number> {
        return this._getCount(this.partyLookupSuccessCountKey, bulkId);
    }

    async getPartyLookupFailedCount(bulkId: string): Promise<number> {
        return this._getCount(this.partyLookupFailedCountKey, bulkId);
    }

    async incrementPartyLookupSuccessCount(
        bulkId: string,
        increment = 1,
    ): Promise<number> {
        return this._incrementCount(this.partyLookupSuccessCountKey, bulkId, increment);
    }

    async incrementPartyLookupFailedCount(
        bulkId: string,
        increment = 1,
    ): Promise<number> {
        return this._incrementCount(this.partyLookupFailedCountKey, bulkId, increment);
    }

    private keyWithPrefix(key: string): string {
        return this.keyPrefix + key;
    }

    // TODO: Just for development purpose for now, can be removed later
    // Warning: consider KEYS as a command that should only be used in production environments with extreme care. It may ruin performance when it is executed against large databases. This command is intended for debugging.
    async getAllBulkIds(): Promise<string[]> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        try {
            const allKeys =  await this._redisClient.keys(this.keyPrefix + '*');
            return allKeys.map(key => key.replace(this.keyPrefix, ''));
        } catch (err) {
            this._logger.error(err, 'Error getting all bulk transaction ids from redis');
            throw (err);
        }
    }

}
