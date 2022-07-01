
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

import { IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { EventEmitter } from 'events'

export type Options<tClientOptions> = {
  client: tClientOptions
  topics: string | string[]
}

export interface iMessageConsumer {
  init: (handlerCallback: (message: IDomainMessage) => Promise<void>, msgNames: string[] | null) => void
  destroy: (forceCommit: boolean) => Promise<void>
  connect: () => void
  pause: () => void
  resume: () => void
  disconnect: () => void
}

export abstract class MessageConsumer extends EventEmitter implements iMessageConsumer {
  abstract init (handlerCallback: (message: IDomainMessage) => Promise<void>, msgNames: string[] | null): void
  abstract destroy (forceCommit: boolean): Promise<void>
  abstract connect (): void
  abstract pause (): void
  abstract resume (): void
  abstract disconnect (): void
}
