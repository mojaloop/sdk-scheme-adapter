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
import { IEntityStateRepository } from './ientity_state_repository'
import { ILogger } from './ilogger'

export abstract class BaseAggregate<E extends BaseEntity<S>, S extends BaseEntityState> {
  protected _logger: ILogger

  protected _rootEntity: E | null

  protected _entity_state_repo: IEntityStateRepository<S>

  constructor (rootEntity: E, entityStateRepo: IEntityStateRepository<S>, logger: ILogger) {
    this._logger = logger

    this._rootEntity = rootEntity
    this._entity_state_repo = entityStateRepo
  }

  async store (): Promise<void> {
    if (this._rootEntity != null) {
      await this._entity_state_repo.store(this._rootEntity.exportState())
    } else {
      throw new Error(`Aggregate doesn't have a valid state to store the state`)
    }
    this._logger.isInfoEnabled() && this._logger.info(`Aggregate state persisted to repository`)

  }

  // protected create (id?: string): void {
  //   this._resetState()
  //   this._rootEntity = (id != null) ? this._entity_factory.createWithId(id) : this._entity_factory.create()
  // }

  // protected async load (aggregateId: string, throwOnNotFound: boolean = true): Promise<void> {
  //   this._resetState()

  //   // TODO implement load from snapshot events and state events, using a state events repository

  //   if (this._entity_state_repo.canCall() == null) {
  //     this._logger.isErrorEnabled() && this._logger.error('Aggregate repository not available to be called')
  //     throw new Error('Aggregate repository not available to be called') // TODO typify these errors
  //   }

  //   const entityState = await this._entity_state_repo.load(aggregateId)
  //   if (entityState == null && throwOnNotFound) {
  //     this._logger.isDebugEnabled() && this._logger.debug(`Aggregate with id: ${aggregateId} not found`)
  //     throw new Error('Aggregate not found') // TODO typify these errors
  //   }

  //   if (entityState != null) {
  //     this._rootEntity = this._rootEntity(entityState)
  //   }
  //   // the reset_state() above already sets the root_entity to null
  // }

  private _resetState (): void {
    this._rootEntity = null
  }
}
