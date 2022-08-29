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

import * as redis from 'redis';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { BulkTransactionState, IndividualTransferState } from '@module-domain';
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

    private readonly partyLookupTotalCountAttributeField = 'partyLookupTotalCount';

    private readonly partyLookupSuccessCountAttributeField = 'partyLookupSuccessCount';

    private readonly partyLookupFailedCountAttributeField = 'partyLookupFailedCount';

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
        if(this._initialized) { this._redisClient.quit(); }
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
            const allIndividualTransferIds = allAttributes.filter(attr => attr.startsWith('individualItem_')).map(attr => attr.replace('individualItem_', ''));
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
            const individualTransferStateStr = await this._redisClient.hGet(key, 'individualItem_' + individualTransferId);
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
            await this._redisClient.hSet(key, 'individualItem_' + individualTransferId, JSON.stringify(value));
        } catch (err) {
            this._logger.error(err, `Error storing individual transfer with ID ${individualTransferId} to redis for key: ${key}`);
            throw (err);
        }
    }

    async setPartyLookupTotalCount(
        bulkId: string,
        count: number,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            await this._redisClient.hSet(key, this.partyLookupTotalCountAttributeField, count);
        } catch (err) {
            this._logger.error(err, 'Error storing partyLookupTotalCount to redis - for key: ' + key);
            throw (err);
        }
    }

    async getPartyLookupTotalCount(bulkId: string): Promise<string | undefined>  {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return await this._redisClient.hGet(key, this.partyLookupTotalCountAttributeField);
        } catch (err) {
            this._logger.error(err, 'Error loading partyLookupTotalCount from redis - for key: ' + key);
            throw (err);
        }
    }

    async incrementPartyLookupSuccessCount(
        bulkId: string,
        increment: number,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            await this._redisClient.hIncrBy(key, this.partyLookupSuccessCountAttributeField, increment);
        } catch (err) {
            this._logger.error(err, 'Error incrementing partyLookupSuccessCount in redis - for key: ' + key);
            throw (err);
        }
    }

    async getPartyLookupSuccessCount(bulkId: string): Promise<string | undefined> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return await this._redisClient.hGet(key, this.partyLookupSuccessCountAttributeField);
        } catch (err) {
            this._logger.error(err, 'Error loading partyLookupSuccessCount from redis - for key: ' + key);
            throw (err);
        }
    }


    async incrementPartyLookupFailedCount(
        bulkId: string,
        increment: number,
    ): Promise<void> {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            await this._redisClient.hIncrBy(key, this.partyLookupFailedCountAttributeField, increment);
        } catch (err) {
            this._logger.error(err, 'Error incrementing partyLookupFailedCount in redis - for key: ' + key);
            throw (err);
        }
    }

    async getPartyLookupFailedCount(bulkId: string): Promise<string | undefined>  {
        if(!this.canCall()) {
            throw (new Error('Repository not ready'));
        }
        const key: string = this.keyWithPrefix(bulkId);
        try {
            return await this._redisClient.hGet(key, this.partyLookupFailedCountAttributeField);
        } catch (err) {
            this._logger.error(err, 'Error loading partyLookupFailedCount from redis - for key: ' + key);
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
