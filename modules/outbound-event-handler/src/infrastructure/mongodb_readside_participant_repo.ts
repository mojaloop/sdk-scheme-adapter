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

import { Collection, MongoClient } from 'mongodb'
import { ILogger } from '@mojaloop-poc/lib-domain'
import { ParticipantState } from '../domain/participant_entity'

export class MongoDbReadsideParticipantRepo {
  protected _mongoClient: MongoClient
  protected _mongoCollection: Collection
  protected _mongoUri: string
  private _initialized: boolean = false
  private readonly _logger: ILogger
  private readonly _databaseName: string = 'moja_poc'
  private readonly _collectionName: string = 'participants_'

  constructor (mongoUri: string, logger: ILogger) {
    this._logger = logger
    this._mongoUri = mongoUri
  }

  async init (): Promise<void> {
    try {
      this._mongoClient = await MongoClient.connect(this._mongoUri, { useNewUrlParser: true })
    } catch (err) {
      const errMsg: string = err?.message?.toString()
      this._logger.isWarnEnabled() && this._logger.warn(`MongoDbReadsideParticipantRepo - init failed with error: ${errMsg}`)
      this._logger.isErrorEnabled() && this._logger.error(err)
      throw (err)
    }

    // this._mongoClient = await MongoClient.connect(this._mongoUri)
    if (this._mongoClient === null) {
      throw new Error('Couldn\'t instantiate mongo client')
    }
    const db = this._mongoClient.db(this._databaseName)
    this._mongoCollection = db.collection(this._collectionName)
    this._initialized = true
  }

  async destroy (): Promise<void> {
    if (this._initialized) {
      await this._mongoClient.close()
    }
  }

  canCall (): boolean {
    return this._initialized // for now, no circuit breaker exists
  }

  async load (id: string): Promise<ParticipantState|null> {
    return await this._mongoCollection.findOne({ id: id })
  }

  async remove (id: string): Promise<void> {

  }

  async insert (participant: ParticipantState): Promise<boolean> {
    const result = await this._mongoCollection.insertOne(participant)
    return result.insertedCount === 1
  }

  // TODO check if we can have number in mongo for the position
  async updatePosition (participantId: string, currency: string, position: string): Promise<boolean> {
    const result = await this._mongoCollection.update(
      { id: participantId, 'accounts.currency': currency },
      { $set: { 'accounts.$.position': position } }
    )
    return result.result.nModified === 1 && result.result.ok === 1
  }
}
