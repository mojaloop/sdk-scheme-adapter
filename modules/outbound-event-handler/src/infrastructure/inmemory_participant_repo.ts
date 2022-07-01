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

import { ParticipantState } from '../domain/participant_entity'
import { IParticipantRepo } from '../domain/participant_repo'
import { ParticipantAccountTypes } from '../../../libPublicMessages/dist/enums'

// export class InMemoryParticipantStateRepo implements IEntityStateRepository<ParticipantState> {
export class InMemoryParticipantStateRepo implements IParticipantRepo {
  private readonly _list: Map<string, ParticipantState> = new Map<string, ParticipantState>()

  async init (): Promise<void> {
    return await Promise.resolve()
  }

  async destroy (): Promise<void> {
    return await Promise.resolve()
  }

  canCall (): boolean {
    return true
  }

  async load (id: string): Promise<ParticipantState|null> {
    return await new Promise((resolve, reject) => {
      if (!this._list.has(id)) { resolve(null) }
      resolve(this._list.get(id)!)
    })
  }

  async remove (id: string): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (!this._list.has(id)) { return reject(new Error('Not found')) } // maybe fail silently?

      this._list.delete(id)
      resolve()
    })
  }

  async store (entityState: ParticipantState): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._list.set(entityState.id, entityState)
      resolve()
    })
  }

  async getAllIds (): Promise<string[]> {
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    return await new Promise(async (resolve, reject) => {
      return resolve(Array.from(this._list.keys()))
    })
  }

  async hasAccount (participantId: string, accType: ParticipantAccountTypes, currency: string): Promise<boolean> {
    const participant = await this.load(participantId)
    return participant?.accounts?.find(account => account.type === accType && account.currency === currency) != null
  }
}
