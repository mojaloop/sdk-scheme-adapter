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

import { BaseEntity } from './base_entity'
import { BaseEntityState } from './base_entity_state'
import { CommandMsg, DomainEventMsg, IDomainMessage, StateEventMsg, StateSnapshotMsg } from './messages'
import { IMessagePublisher } from './imessage_publisher'
import { IEntityStateRepository } from './ientity_state_repository'
import { IESourcingStateRepository, TESourcingState } from './ientity_es_state_repository'
import { IEntityFactory } from './entity_factory'
import { ILogger } from './ilogger'
import { IEntityDuplicateRepository } from './ientity_duplicate_repository'
import { now } from './local_utils'
export type TCommandResult = {
  success: boolean
  stateEvent: StateEventMsg | null
}

export abstract class BaseEventSourcingAggregate<E extends BaseEntity<S>, S extends BaseEntityState> {
  protected _logger: ILogger
  private readonly _stateEventHandlers: Map<string, (stateEvent: StateEventMsg, replayed?: boolean) => Promise<void>>
  private readonly _commandHandlers: Map<string, (cmd: CommandMsg) => Promise<TCommandResult>>
  private _snapshotEventHandler: (snapshotEvent: StateSnapshotMsg, replayed?: boolean) => Promise<void>

  private _uncommittedDomainEvents: DomainEventMsg[]
  protected _rootEntity: E | null

  protected _entity_factory: IEntityFactory<E, S>
  protected _msgPublisher: IMessagePublisher
  protected _entity_cache_repo: IEntityStateRepository<S>
  protected _entityDuplicateRepo: IEntityDuplicateRepository | null
  protected _esRepo: IESourcingStateRepository

  constructor (entityFactory: IEntityFactory<E, S>, entityStateCacheRepo: IEntityStateRepository<S>, entityDuplicateRepo: IEntityDuplicateRepository | null, esStateRepo: IESourcingStateRepository, msgPublisher: IMessagePublisher, logger: ILogger) {
    this._logger = logger

    this._stateEventHandlers = new Map<string, (stateEvent: StateEventMsg, replayed?: boolean) => Promise<void>>()
    this._commandHandlers = new Map<string, (cmd: CommandMsg) => Promise<TCommandResult>>()
    this._uncommittedDomainEvents = []
    this._rootEntity = null

    this._entity_factory = entityFactory

    this._entity_cache_repo = entityStateCacheRepo
    this._entityDuplicateRepo = entityDuplicateRepo
    this._esRepo = esStateRepo
    this._msgPublisher = msgPublisher
  }

  private _resetState (): void {
    this._uncommittedDomainEvents = []
    this._rootEntity = null
  }

  private async applyStateEvent (stateEvent: StateEventMsg, replayed?: boolean): Promise<void> {
    const handler = this._stateEventHandlers.get(stateEvent.msgName)
    if (handler == null) {
      throw new Error(`Aggregate doesn't have a handler for a stateEvent with name ${stateEvent.msgName}`)
    }

    return await handler.call(this, stateEvent, replayed).then(async () => {
      /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
      this._logger.isInfoEnabled() && this._logger.info(`Aggregate successfully applied state event @ ${stateEvent.msgOffset} - id: ${stateEvent.msgId}, name: ${stateEvent.msgName}`)
    }).catch(async (err: any) => {
      /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
      this._logger.isErrorEnabled() && this._logger.error(err, `Aggregate error trying to apply state event @ ${stateEvent.msgOffset} - id: ${stateEvent.msgId}, name: ${stateEvent.msgName}`)
      throw err
    })
  }

  private async applyManyStateEvents (stateEvents: StateEventMsg[], replayed?: boolean): Promise<void> {
    return await Promise.all(stateEvents.map(async (evt: StateEventMsg) => await this.applyStateEvent(evt, replayed))).then()
  }

  protected _setSnapshotHandler (handler: (snapshotEvent: StateSnapshotMsg, replayed?: boolean) => Promise<void>): void {
    this._snapshotEventHandler = handler
  }

  protected _registerStateEventHandler (stateEventName: string, handler: (stateEvent: StateEventMsg, replayed?: boolean) => Promise<void>): void {
    this._stateEventHandlers.set(stateEventName, handler)
  }

  protected _registerCommandHandler (cmdName: string, handler: (commandMsg: CommandMsg) => Promise<TCommandResult>): void {
    this._commandHandlers.set(cmdName, handler)
  }

  protected create (id?: string): void {
    this._resetState()
    this._rootEntity = (id != null) ? this._entity_factory.createWithId(id) : this._entity_factory.create()
  }

  protected async load (aggregateId: string, throwOnNotFound: boolean = true): Promise<void> {
    const startTimeMicroSecs = now('micro')
    this._resetState()

    // TODO implement load from snapshot events and state events, using a state events repository
    let entityState: S | null = null

    // try loading from cache
    if (this._entity_cache_repo.canCall()) {
      entityState = await this._entity_cache_repo.load(aggregateId)
    }

    if (entityState != null) {
      this._rootEntity = this._entity_factory.createFromState(entityState)
      this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} loaded from cache - took: ${now('micro') - startTimeMicroSecs} microseconds`)
      return
    }

    const esState: TESourcingState| null = await this._esRepo.load(aggregateId)

    // // TODO fixme - duplicated below on the catch
    // if ((esState === null || (esState.snapshot === null && esState.events === null)) && throwOnNotFound) {
    //   this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} not found - took: ${now('micro') - startTimeMicroSecs} microseconds`)
    //   throw new Error('Aggregate not found') // TODO typify these errors
    // }

    if (esState?.snapshot != null || (esState?.events != null && esState?.events.length > 0)) {
      // create empty object
      this._rootEntity = this._entity_factory.createWithId(aggregateId)

      if (esState?.snapshot != null) {
        await this._snapshotEventHandler(esState.snapshot, true)
      }

      if (esState?.events != null && esState?.events.length > 0) {
        await this.applyManyStateEvents(esState.events, true)
      }

      // update cache from ES
      if (this._rootEntity !== null && this._rootEntity !== undefined) {
        process.nextTick(async () => {
          // @ts-expect-error
          await this._entity_cache_repo.store(this._rootEntity.exportState())
        })
      }

      this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} loaded from the event stream - took: ${now('micro') - startTimeMicroSecs} microseconds`)
    } else {
      this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} not found - took: ${now('micro') - startTimeMicroSecs} microseconds`)
      if (throwOnNotFound) {
        throw new Error('Aggregate not found') // TODO typify these errors
      }
    }
  }

  protected recordDomainEvent (domainEvent: DomainEventMsg): void {
    this._uncommittedDomainEvents.push(domainEvent)
  }

  protected async commitEvents (stateEvent: StateEventMsg | null): Promise<void> {
    if (this._uncommittedDomainEvents.length <= 0 && stateEvent === null) {
      this._logger.isWarnEnabled() && this._logger.warn('Called aggregate commit without uncommitted events to commit')
      return
    }

    let events: IDomainMessage[] = []
    if (this._uncommittedDomainEvents != null && this._uncommittedDomainEvents.length > 0) {
      events = events.concat(this._uncommittedDomainEvents)
    }
    if (stateEvent !== null) {
      events.push(stateEvent)
    }

    const eventNames = events.map(evt => evt.msgName)

    events.forEach(evt => {
      this._logger.isDebugEnabled() && this._logger.debug(`Committing name:'${evt.msgName}'; key:'${evt.msgKey}'; id:'${evt.msgId}'`)
    })

    await this._msgPublisher.publishMany(events)

    this._logger.isDebugEnabled() && this._logger.debug(`Aggregate committed ${events.length} events - ${JSON.stringify(eventNames)}`)

    this._uncommittedDomainEvents = []
  }

  protected propagateTraceInfo (sourceMsg: IDomainMessage): void {
    if (sourceMsg.traceInfo == null) return

    this._uncommittedDomainEvents.forEach(msg => msg.passTraceInfo(sourceMsg))
  }

  async store (entityState: S, commandMsg: CommandMsg): Promise<void> {
    await this._entity_cache_repo.store(entityState)
  }

  async processCommand (commandMsg: CommandMsg): Promise<boolean> {
    const handler = this._commandHandlers.get(commandMsg.msgName)
    if (handler == null) {
      throw new Error(`Aggregate doesn't have a handler for a command with name ${commandMsg.msgName}`)
    }

    this._resetState()
    // the local cmd handler code must either load or create the aggregate

    // TODO check for consistency, ie, versions
    return await handler.call(this, commandMsg).then(async (result: TCommandResult) => {
      this.propagateTraceInfo(commandMsg)

      if (!result.success) {
        // commit only domain events
        await this.commitEvents(null)
        this._logger.isInfoEnabled() && this._logger.info(`Command '${commandMsg.msgName}' execution failed`)
        return false
      }

      if (result.stateEvent === null || result.stateEvent === undefined) {
        this._logger.isWarnEnabled() && this._logger.warn(`Command '${commandMsg.msgName}' execution was successful but no state event was returned`)
      }

      await this.commitEvents(result.stateEvent) // send out the unpublished events regardless

      if (this._rootEntity != null) {
        await this.store(this._rootEntity.exportState(), commandMsg)
        this._logger.info(`Aggregate state persisted to repository at the end of command: ${commandMsg.msgName}`)
      } else {
        throw new Error(`Aggregate doesn't have a valid state after processing command with name ${commandMsg.msgName}`)
      }

      this._logger.isInfoEnabled() && this._logger.info(`Aggregate successfully processed command: ${commandMsg.msgName}`)
      return true
    }).catch(async (err: any) => {
      await this.commitEvents(null) // we still send out the unpublished domain events... but not state
      this._logger.isErrorEnabled() && this._logger.error(err, `Aggregate error trying to process command: ${commandMsg.msgName}`)
      throw err
    })
  }
}
