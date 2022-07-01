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

import { ILogger, IESourcingStateRepository, TESourcingState, IMessageFetcher, IMessageOffsetRepo, TEventStoreMessageOffset, StateSnapshotMsg, StateEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { RDKafkaFetcher } from './rdkafka_fetcher'
import { RedisMessageOffsetRepo } from './redis_messageoffset_repo'

export class EventSourcingStateRepo implements IESourcingStateRepository {
  private readonly _redisConnStr: string
  private readonly _kafkahost: string
  private readonly _logger: ILogger

  private readonly _aggregateName: string
  private readonly _snapshotsTopic: string
  private readonly _eventsTopic: string

  private _initialized: boolean = false

  protected _redisOffsetRepo!: IMessageOffsetRepo
  protected _kafkaMsgFetcher!: IMessageFetcher

  constructor (redisConnStr: string, clusteredRedis: boolean, kafkaHost: string, aggregateName: string, snapshotTopic: string, stateEventsTopic: string, logger: ILogger) {
    this._redisConnStr = redisConnStr
    this._kafkahost = kafkaHost
    this._logger = logger

    this._aggregateName = aggregateName
    this._snapshotsTopic = snapshotTopic
    this._eventsTopic = stateEventsTopic

    this._redisOffsetRepo = new RedisMessageOffsetRepo(this._redisConnStr, clusteredRedis, `${this._aggregateName}Offsets_`, this._logger)
    this._kafkaMsgFetcher = new RDKafkaFetcher(this._kafkahost, `${this._aggregateName}EventSourcingRepo`, this._logger)
  }

  async init (): Promise<void> {
    await this._redisOffsetRepo.init()
    await this._kafkaMsgFetcher.init()
    this._initialized = true
  }

  async destroy (): Promise<void> {
    if (this._initialized) {
      await this._redisOffsetRepo.destroy()
      await this._kafkaMsgFetcher.destroy()
    }

    return await Promise.resolve()
  }

  canCall (): boolean {
    return this._initialized // for now, no circuit breaker exists
  }

  async load (id: string): Promise<TESourcingState | null> {
    /*
    1. get offsets for snapshot from redis perm store
    2. get snapshot
    3. get events
    4. return
    5. if no offsets were stored before, store them now
     */

    this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - trying to get snapshot offsets from cache for entity id: ${id}...`)

    const snapshotOffsets: TEventStoreMessageOffset | null = await this._redisOffsetRepo.load(id)

    let partition = -1
    let offset = 0
    if (snapshotOffsets != null) {
      partition = snapshotOffsets.partition
      offset = snapshotOffsets.offset
      this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - snapshot offsets found for entity id: ${id}`)
    } else {
      this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo - snapshot offsets NOT found for entity id: ${id}`)
    }

    this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - trying to fetch last snapshot for entity id: ${id}...`)
    const snapshotGenMsg = await this._kafkaMsgFetcher.fetchLast(id, this._snapshotsTopic, partition, offset)

    let snapshot: StateSnapshotMsg | undefined
    if (snapshotGenMsg != null) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      snapshot = snapshotGenMsg as StateSnapshotMsg
      partition = snapshot.eventsPartition
      offset = snapshot.lastEventOffset
      this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - snapshot found entity id: ${id}`)
    } else {
      this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - snapshot NOT found for entity id: ${id}...`)
    }

    this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - trying to fetch events for entity id: ${id}...`)
    const events = await this._kafkaMsgFetcher.fetchAll(id, this._eventsTopic, partition, offset)

    this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - got ${events.length} events for entity id: ${id}...`)

    // if there is a snapshot that was not on the offset cache, then store it
    if (snapshotOffsets === null && snapshotGenMsg !== null && snapshotGenMsg.msgPartition !== null && snapshotGenMsg.msgOffset !== null) {
      process.nextTick(async () => {
        this._logger.isDebugEnabled() && this._logger.debug(`EventSourcingStateRepo.load() - updating offset cache for entity id: ${id}...`)
        await this._redisOffsetRepo.store({
          aggregateId: id,
          topic: snapshotGenMsg.msgTopic,
          // @ts-expect-error
          partition: snapshotGenMsg.msgPartition,
          // @ts-expect-error
          offset: snapshotGenMsg.msgOffset
        })
      })
    }

    return {
      snapshot: snapshot,
      events: events as StateEventMsg[] | []
    }
  }
}
