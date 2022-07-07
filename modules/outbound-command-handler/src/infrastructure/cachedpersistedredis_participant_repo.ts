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

import * as redis from 'redis'
import { ILogger } from '@mojaloop/sdk-scheme-adapter-public-types-lib'
import { ParticipantState } from '../domain/participant_entity'
import { IParticipantRepo } from '../domain/participant_repo'
import { ParticipantAccountTypes, ParticipantEndpoint } from '@mojaloop/sdk-scheme-adapter-public-messages-lib'
// @ts-expect-error
import RedisClustr = require('redis-clustr')

/***
 * TODO:
* - Store currently only stores ParticipantState if it was not found in the `_inMemorylist`. /
*   This should be fixed in future to ensure that there consistency between the in-memory cache and redis. /
*   However this is easier said than done, and needs some thinking. This is however not a concern at this /
*   stage as we expect a CQRS pattern to be used over this repo.
 */

export class CachedPersistedRedisParticipantStateRepo implements IParticipantRepo {
  protected _redisClient!: redis.RedisClient
  protected _redisClustered: boolean
  private readonly _redisConnStr: string
  private readonly _redisConnClusterHost: string
  private readonly _redisConnClusterPort: number
  private readonly _inMemorylist: Map<string, ParticipantState> = new Map<string, ParticipantState>()
  private readonly _logger: ILogger
  private _initialized: boolean = false
  private readonly keyPrefix: string = 'participant_'

  constructor (connStr: string, clusteredRedis: boolean, logger: ILogger) {
    this._redisConnStr = connStr
    this._logger = logger
    this._redisClustered = clusteredRedis

    const splited = connStr.split('//')[1]
    this._redisConnClusterHost = splited.split(':')[0]
    this._redisConnClusterPort = Number.parseInt(splited.split(':')[1])
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
        this._logger.isInfoEnabled() && this._logger.info('Redis client ready')
        if (this._initialized) { return }

        this._initialized = true
        return resolve()
      })

      this._redisClient.on('error', (err) => {
        this._logger.isErrorEnabled() && this._logger.error(err, 'A redis error has occurred:')
        if (!this._initialized) { return reject(err) }
      })
    })
  }

  async destroy (): Promise<void> {
    if (this._initialized) { this._redisClient.quit() }

    return await Promise.resolve()
  }

  canCall (): boolean {
    return this._initialized // for now, no circuit breaker exists
  }

  async load (id: string): Promise<ParticipantState | null> {
    return await new Promise((resolve, reject) => {
      if (!this.canCall()) return reject(new Error('Repository not ready'))

      const key: string = this.keyWithPrefix(id)

      if (this._inMemorylist.has(key)) {
        return resolve(this._inMemorylist.get(key)!)
      }

      this._redisClient.get(key, (err: Error | null, result: string | null) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'Error fetching entity state from redis - for key: ' + key)
          return reject(err)
        }
        if (result == null) {
          this._logger.isDebugEnabled() && this._logger.debug('Entity state not found in redis - for key: ' + key)
          return resolve(null)
        }
        try {
          const state: ParticipantState = JSON.parse(result)

          this._inMemorylist.set(key, state)

          return resolve(state)
        } catch (err) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'Error parsing entity state from redis - for key: ' + key)
          return reject(err)
        }
      })
    })
  }

  async remove (id: string): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (!this.canCall()) return reject(new Error('Repository not ready'))

      const key: string = this.keyWithPrefix(id)

      if (this._inMemorylist.has(key)) {
        this._inMemorylist.delete(key)
      }

      this._redisClient.del(key, (err?: Error|null, result?: number) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'Error removing entity state from redis - for key: ' + key)
          return reject(err)
        }
        if (result !== 1) {
          this._logger.isDebugEnabled() && this._logger.debug('Entity state not found in redis - for key: ' + key)
          return resolve()
        }

        return resolve()
      })
    })
  }

  async store (entityState: ParticipantState): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (!this.canCall()) return reject(new Error('Repository not ready'))

      const key: string = this.keyWithPrefix(entityState.id)

      this._logger.isDebugEnabled() && this._logger.debug(`CachedRedisParticipantStateRepo::store - storing ${entityState.id} in-memory only, AND redis as we have not seen this participant before!`)

      this._inMemorylist.set(key, entityState)

      // resolve()

      let stringValue: string | undefined
      try {
        stringValue = JSON.stringify(entityState)
      } catch (err) {
        this._logger.isErrorEnabled() && this._logger.error(err, 'Error parsing entity state JSON - for key: ' + key)
        return reject(err)
      }

      if (stringValue == null) {
        return reject(new Error('Error parsing entity state JSON - for key: ' + key))
      }

      this._redisClient.set(key, stringValue, (err: Error | null, reply: string) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'Error storing entity state to redis - for key: ' + key)
          return reject(err)
        }
        if (reply !== 'OK') {
          this._logger.isErrorEnabled() && this._logger.error('Unsuccessful attempt to store the entity state in redis - for key: ' + key)
          return reject(new Error('Unsuccessful attempt to store the entity state in redis - for key: ' + key))
        }
        return resolve()
      })
    })
  }

  async getAllIds (): Promise<string[]> {
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    return await new Promise(async (resolve, reject) => {
      this._logger.isDebugEnabled() && this._logger.debug('CachedPersistedRedisParticipantStateRepo::getAll() - start')

      if (!this.canCall()) return reject(new Error('Repository not ready'))
      this._redisClient.keys(this.keyPrefix + '*', (err: Error | null, result: string[]) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, `Error retrieving all keys with prefix: ${this.keyPrefix}`)
          return reject(err)
        }
        this._logger.isDebugEnabled() && this._logger.debug(`CachedPersistedRedisParticipantStateRepo::getAll() - got back, ${result.length} results'`)
        let results: string[]
        result.forEach((val: string) => {
          results.push(val.replace(this.keyPrefix, ''))
        })

        return resolve(result)
      })
    })
  }

  private keyWithPrefix (key: string): string {
    return this.keyPrefix + key
  }

  async hasAccount (participantId: string, accType: ParticipantAccountTypes, currency: string): Promise<boolean> {
    const participant = await this.load(participantId)
    return participant?.accounts?.find(account => account.type === accType && account.currency === currency) != null
  }

  async getEndPoints (participantId: string): Promise<ParticipantEndpoint[]|undefined> {
    const participant = await this.load(participantId)
    return participant?.endpoints
  }
}
