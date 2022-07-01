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

 * Coil
 - Donovan Changfoot <donovan.changfoot@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * ModusBox
 - Miguel de Barros <miguel.debarros@modusbox.com>
 - Roman Pietrzak <roman.pietrzak@modusbox.com>

 --------------
 ******/
'use strict'

// import * as redis from 'redis'
import { ILogger, IEntityDuplicateRepository } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import * as redis from 'redis'
// @ts-expect-error
import RedisClustr = require('redis-clustr')

export class RedisDuplicateShardedRepo implements IEntityDuplicateRepository {
  protected _redisClient!: redis.RedisClient
  protected _redisClustered: boolean
  private readonly _redisConnStr: string
  private readonly _redisConnClusterHost: string
  private readonly _redisConnClusterPort: number
  private readonly _logger: ILogger
  private _initialized: boolean = false
  private readonly _setKey: string
  private readonly _partitionEnabled: boolean

  constructor (connStr: string, clusteredRedis: boolean, setKey: string, logger: ILogger, partitionEnabled: boolean = false) {
    this._redisConnStr = connStr
    this._logger = logger
    this._setKey = setKey
    this._redisClustered = clusteredRedis
    this._partitionEnabled = partitionEnabled

    const splited = connStr.split('//')[1]
    this._redisConnClusterHost = splited.split(':')[0]
    this._redisConnClusterPort = Number.parseInt(splited.split(':')[1])
  }

  private getKey (id: string | undefined = undefined): string {
    let key: string
    if (this._partitionEnabled && id != null) {
      const char = id.charAt(0)
      key = `${this._setKey}_${char}`
    } else {
      key = this._setKey
    }
    /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
    this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::getKey(id=${id}) - key=${key}`)
    return key
  }

  private async getPartitionSets (): Promise<string[] | null | undefined> {
    return await new Promise((resolve, reject) => {
      const keyPattern = `${this._setKey}*`
      this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::getMembers() - keyPattern=${keyPattern}`)
      if (!this.canCall()) return reject(new Error('Repository not ready'))
      this._redisClient.keys(keyPattern, (err: Error | null, result: string[] | undefined) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error getMembers for set to redis: ${keyPattern}`)
          return reject(err)
        }
        return resolve(result)
      })
    })
  }

  async init (): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (this._redisClustered) {
        this._redisClient = new RedisClustr({
          servers: [{ host: this._redisConnClusterHost, port: this._redisConnClusterPort }]
        })
      } else {
        this._redisClient = redis.createClient({ url: this._redisConnStr })
      }

      this._redisClient.on('ready', () => {
        this._logger.isDebugEnabled() && this._logger.debug('Redis client ready')
        if (this._initialized) { return }
        this._initialized = true
        return resolve()
      })

      this._redisClient.on('error', (err: Error) => {
        this._logger.isErrorEnabled() && this._logger.error(err, 'A redis error has occurred:')
        if (!this._initialized) { return reject(err) }
      })
    })
  }

  async add (id: string): Promise<boolean> {
    return await new Promise((resolve, reject) => {
      const key = this.getKey(id)
      this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::add(id=${id}) - key=${key}`)
      if (!this.canCall()) return reject(new Error('Repository not ready'))
      this._redisClient.sadd(key, id, (err: Error | null, result: number) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error storing '${id}' for set to redis: ${key}`)
          return reject(err)
        }
        if (result === 1) {
          return resolve(true)
        } else {
          return resolve(false)
        }
      })
    })
  }

  async exists (id: string): Promise<boolean> {
    return await new Promise((resolve, reject) => {
      const key = this.getKey(id)
      this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::exists(id=${id}) - key=${key}`)
      if (!this.canCall()) return reject(new Error('Repository not ready'))
      this._redisClient.sismember(key, id, (err: Error | null, result: number) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error checking '${id}' for set to redis: ${key}`)
          return reject(err)
        }
        if (result === 1) {
          return resolve(true)
        } else {
          return resolve(false)
        }
      })
    })
  }

  async remove (id: string): Promise<boolean> {
    return await new Promise((resolve, reject) => {
      const key = this.getKey(id)
      this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::remove(id=${id}) - key=${key}`)
      if (!this.canCall()) return reject(new Error('Repository not ready'))
      this._redisClient.srem(key, id, (err: Error | null, result: number) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error removing '${id}' from set to redis: ${key}`)
          return reject(err)
        }
        if (result === 1) {
          return resolve(true)
        } else {
          return resolve(false)
        }
      })
    })
  }

  private async getPartitionMembers (partition: string): Promise<string[]> {
    return await new Promise((resolve, reject) => {
      this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::getPartitionMembers(partition = ${partition}) - start`)
      this._redisClient.smembers(partition, (err: Error | null, result: string[]) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error retrieving all members of redis set: ${partition}`)
          return reject(err)
        }
        return resolve(result)
      })
    })
  }

  async getAll (): Promise<string[]> {
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    return await new Promise(async (resolve, reject) => {
      this._logger.isDebugEnabled() && this._logger.debug('RedisDuplicateShardedRepo::getAll() - start')
      if (!this.canCall()) return reject(new Error('Repository not ready'))
      const partitionSets = await this.getPartitionSets()
      if (this._partitionEnabled && partitionSets != null && partitionSets?.length > 0) {
        const resultSet: Set<string> = new Set()
        for (var partition of partitionSets) {
          this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::getAll() - key=${partition}`)

          const partitionMembers = await this.getPartitionMembers(partition)
          for (var value of partitionMembers) {
            resultSet.add(value)
          }
        }
        this._logger.isDebugEnabled() && this._logger.debug(`RedisDuplicateShardedRepo::getAll() - result=${JSON.stringify(Array.from(resultSet))}`)
        return resolve(Array.from(resultSet))
      } else {
        const key = this.getKey()
        this._redisClient.smembers(key, (err: Error | null, result: string[]) => {
          if (err != null) {
            this._logger.isErrorEnabled() && this._logger.error(err, `Error retrieving all members of redis set: ${key}`)
            return reject(err)
          }
          return resolve(result)
        })
      }
    })
  }

  async destroy (): Promise<void> {
    if (this._initialized) { this._redisClient.quit() }

    return await Promise.resolve()
  }

  canCall (): boolean {
    return this._initialized // for now, no circuit breaker exists
  }
}
