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

import * as redis from 'redis'
import { ILogger } from '@mojaloop/sdk-scheme-adapter-public-types-lib'
import { BulkTransactionState } from '../domain/bulk_transaction_entity'
import { IBulkTransactionEntityRepo } from '../domain/bulk_transaction_entity_repo'
// @ts-expect-error
import RedisClustr = require('redis-clustr')

export class RedisHSetBulkTransactionStateRepo implements IBulkTransactionEntityRepo {
  protected _redisClient!: redis.RedisClientType
  protected _redisClustered: boolean
  private readonly _redisConnStr: string
  private readonly _redisConnClusterHost: string
  private readonly _redisConnClusterPort: number
  private readonly _logger: ILogger
  private _initialized: boolean = false
  private readonly keyPrefix: string = 'outboundBulkTransaction_'

  constructor (connStr: string, clusteredRedis: boolean, logger: ILogger) {
    this._redisConnStr = connStr
    this._logger = logger
    this._redisClustered = clusteredRedis

    const splited = connStr.split('//')[1]
    this._redisConnClusterHost = splited.split(':')[0]
    this._redisConnClusterPort = Number.parseInt(splited.split(':')[1])
  }

  async init (): Promise<void> {
    if (this._redisClustered) {
      this._redisClient = new RedisClustr({
        servers: [{ host: this._redisConnClusterHost, port: this._redisConnClusterPort }]
      })
    } else {
      this._redisClient = redis.createClient({ url: this._redisConnStr })
    }
    this._redisClient.on('error', (err) => {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error connecting to redis server: ' + err.message)
      if(!this._initialized) {
        throw(err)
      }
    })
    await this._redisClient.connect()
    this._initialized = true
  }

  async destroy (): Promise<void> {
    if (this._initialized) { this._redisClient.quit() }
    return await Promise.resolve()
  }

  canCall (): boolean {
    return this._initialized // for now, no circuit breaker exists
  }

  async load (id: string): Promise<BulkTransactionState> {
    if (!this.canCall()) {
      throw(new Error('Repository not ready'))
    }
    const key: string = this.keyWithPrefix(id)
    try {
      const bulkTransactionEntityStateStr = await this._redisClient.hGet(key, 'bulkTransactionEntityState')
      if (bulkTransactionEntityStateStr) {
        return JSON.parse(bulkTransactionEntityStateStr)
      } else {
        this._logger.isErrorEnabled() && this._logger.error('Error loading entity state from redis - for key: ' + key)
        throw(new Error('Error loading entity state from redis'))
      }
    } catch(err) {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error loading entity state from redis - for key: ' + key)
      throw(err)
    }
  }

  async remove (id: string): Promise<void> {
    if (!this.canCall()) {
      throw(new Error('Repository not ready'))
    }
    const key: string = this.keyWithPrefix(id)
    try {
      await this._redisClient.del(key)
    } catch(err) {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error removing entity state from redis - for key: ' + key)
      throw(err)
    }
  }

  async store (entityState: BulkTransactionState): Promise<void> {
    if (!this.canCall()) {
      throw(new Error('Repository not ready'))
    }
    const key: string = this.keyWithPrefix(entityState.id)
    try {
      await this._redisClient
        .multi()
        .hSet(key, 'id', entityState.id || '')
        .hSet(key, 'bulkTransactionEntityState', JSON.stringify(entityState))
        .exec()
    } catch(err) {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error storing entity state to redis - for key: ' + key)
      throw(err)
    }
  }

  async getAllAttributes (id: string): Promise<string[]> {
    if (!this.canCall()) {
      throw(new Error('Repository not ready'))
    }
    const key: string = this.keyWithPrefix(id)
    try {
      const allAttributes = await this._redisClient.hKeys(key)
      return allAttributes
    } catch(err) {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error getting attributes from redis - for key: ' + key)
      throw(err)
    }
  }

  private keyWithPrefix (key: string): string {
    return this.keyPrefix + key
  }

}