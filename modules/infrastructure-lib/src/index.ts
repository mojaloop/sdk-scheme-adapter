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

export enum RedisDuplicateInfraTypes {
  REDIS = 'redis',
  REDIS_SHARDED = 'redis-sharded',
  MEMORY = 'memory'
}

// Exports for Infrastructure
export * from './kafka_events_consumer'
export * from './kafka_domain_events_consumer'
export * from './kafka_command_events_consumer'
export * from './kafka_events_producer'
export * from './kafka_domain_events_producer'
export * from './kafka_command_events_producer'
export * from './irun_handler'
export * from './api_server'
export * from './inmemory_duplicate_repo'
export * from './redis_duplicate_repo'
export * from './redis_duplicate_sharded_repo'
export * from './redis_messageoffset_repo'

