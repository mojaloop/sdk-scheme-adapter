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
import { CommandMsg, DomainEventMsg, DomainMsg, IDomainMessage, StateEventMsg } from './messages'
import { IMessagePublisher } from './imessage_publisher'
import { IEntityStateRepository } from './ientity_state_repository'
import { IEntityFactory } from './entity_factory'
import { ILogger } from './ilogger'

export abstract class BaseAggregate<E extends BaseEntity<S>, S extends BaseEntityState> {
  protected _logger: ILogger
  private readonly _commandHandlers: Map<string, (cmd: CommandMsg) => Promise<boolean>>

  private _uncommittedEvents: DomainMsg[]
  protected _rootEntity: E | null

  protected _entity_factory: IEntityFactory<E, S>
  protected _msgPublisher: IMessagePublisher
  protected _entity_state_repo: IEntityStateRepository<S>

  constructor (entityFactory: IEntityFactory<E, S>, entityStateRepo: IEntityStateRepository<S>, msgPublisher: IMessagePublisher, logger: ILogger) {
    this._logger = logger

    this._commandHandlers = new Map<string, (cmd: CommandMsg) => Promise<boolean>>()
    this._uncommittedEvents = []
    this._rootEntity = null

    this._entity_factory = entityFactory

    this._entity_state_repo = entityStateRepo
    this._msgPublisher = msgPublisher
  }

  async processCommand (commandMsg: CommandMsg): Promise<boolean> {
    const handler = this._commandHandlers.get(commandMsg.msgName)
    if (handler == null) {
      throw new Error(`Aggregate doesn't have a handler for a command with name ${commandMsg.msgName}`)
    }

    this._resetState()
    // the local cmd handler code must either load or create the aggregate

    // TODO check for consistency, ie, versions
    return await handler.call(this, commandMsg).then(async (result: boolean) => {
      this.propagateTraceInfo(commandMsg)
      await this.commit() // send out the unpublished events regardless

      // until we have full event sourcing we have to persist
      if (!result) {
        this._logger.isInfoEnabled() && this._logger.info(`Command '${commandMsg.msgName}' execution failed`)
        return false
      }

      if (this._rootEntity != null) {
        await this._entity_state_repo.store(this._rootEntity.exportState())
      } else {
        throw new Error(`Aggregate doesn't have a valid state to process command with name ${commandMsg.msgName}`)
      }
      this._logger.isInfoEnabled() && this._logger.info(`Aggregate state persisted to repository at the end of command: ${commandMsg.msgName}`)
      return true
    }).catch(async (err: any) => {
      await this.commit() // we still send out the unpublished events
      this._logger.isErrorEnabled() && this._logger.error(err, `Aggregate state persisted to repository at the end of command: ${commandMsg.msgName}`)
      throw err
    })
  }

  protected _registerCommandHandler (cmdName: string, handler: (commandMsg: CommandMsg) => Promise<boolean>): void {
    this._commandHandlers.set(cmdName, handler)
  }

  protected create (id?: string): void {
    this._resetState()
    this._rootEntity = (id != null) ? this._entity_factory.createWithId(id) : this._entity_factory.create()
  }

  protected async load (aggregateId: string, throwOnNotFound: boolean = true): Promise<void> {
    this._resetState()

    // TODO implement load from snapshot events and state events, using a state events repository

    if (this._entity_state_repo.canCall() == null) {
      this._logger.isErrorEnabled() && this._logger.error('Aggregate repository not available to be called')
      throw new Error('Aggregate repository not available to be called') // TODO typify these errors
    }

    const entityState = await this._entity_state_repo.load(aggregateId)
    if (entityState == null && throwOnNotFound) {
      this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} not found`)
      throw new Error('Aggregate not found') // TODO typify these errors
    }

    if (entityState != null) {
      this._rootEntity = this._entity_factory.createFromState(entityState)
    }
    // the reset_state() above already sets the root_entity to null
  }

  protected recordDomainEvent (domainEvent: DomainEventMsg): void {
    this._uncommittedEvents.push(domainEvent)
  }

  protected recordStateEvent (stateEvent: StateEventMsg): void {
    this._uncommittedEvents.push(stateEvent)
  }

  protected async commit (): Promise<void> {
    if (this._uncommittedEvents.length <= 0) {
      this._logger.isWarnEnabled() && this._logger.warn('Called aggregate commit without uncommitted events to commit')
      return
    }

    const eventNames = this._uncommittedEvents.map(evt => evt.msgName)

    this._uncommittedEvents.forEach(evt => {
      this._logger.isDebugEnabled() && this._logger.debug(`Commiting name:'${evt.msgName}';key:'${evt.msgKey}';id:'${evt.msgId}'`)
    })

    await this._msgPublisher.publishMany(this._uncommittedEvents)

    this._logger.isDebugEnabled() && this._logger.debug(`Aggregate committed ${this._uncommittedEvents.length} events - ${JSON.stringify(eventNames)}`)

    this._uncommittedEvents = []
  }

  protected propagateTraceInfo (sourceMsg: IDomainMessage): void {
    if (sourceMsg.traceInfo == null) return

    this._uncommittedEvents.forEach(msg => msg.passTraceInfo(sourceMsg))
  }

  private _resetState (): void {
    this._uncommittedEvents = []
    this._rootEntity = null
  }
}
