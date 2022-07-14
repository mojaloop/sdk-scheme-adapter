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
 * Modusbox
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict'

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import {
  IRunHandler,
  KafkaDomainEventsConsumer,
  KafkaCommandEventsProducer,
  IEventsConsumer,
  DomainEventMessage,
  OutboundDomainEventMessageName,
  Crypto
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { IDomainEventHandlerOptions } from '../types'
import { handleSDKOutboundBulkRequestReceived } from './handlers'

export class OutboundEventHandler implements IRunHandler {
  private _logger: ILogger
  private _consumer: IEventsConsumer
  private _commandProducer: KafkaCommandEventsProducer
  private _clientId: string
  private _domainEventHandlerOptions: IDomainEventHandlerOptions


  async start (appConfig: any, logger: ILogger): Promise<void> {
    this._logger = logger
    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler::start - appConfig=${JSON.stringify(appConfig)}`)
    this._clientId = `outboundEvtHandler-${appConfig.kafka.consumer as string}-${Crypto.randomBytes(8)}`

    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - Creating ${appConfig.kafka.consumer as string}...`)

    this._consumer = new KafkaDomainEventsConsumer(this._messageHandler.bind(this), logger)

    logger.isInfoEnabled() && logger.info(`outboundEvtHandler - Created kafkaConsumer of type ${this._consumer.constructor.name}`)

    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    await this._consumer.init() // we're interested in all stateEvents
    await this._consumer.start()

    this._commandProducer = new KafkaCommandEventsProducer(logger)
    await this._commandProducer.init()

    // Create options for handlers
    this._domainEventHandlerOptions = {
      commandProducer: this._commandProducer
    }
  }

  async destroy (): Promise<void> {
    await this._consumer.destroy()
    await this._commandProducer.destroy()
  }

  async _messageHandler (message: DomainEventMessage): Promise<void> {
    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - ${message.getName()}`)
    console.log(message)
    switch (message.getName()) {
      case OutboundDomainEventMessageName.SDKOutboundBulkRequestReceived: {
        handleSDKOutboundBulkRequestReceived(message, this._domainEventHandlerOptions, this._logger)
        break;
      }
      default: {
        this._logger.isDebugEnabled() && this._logger.debug(`outboundEvtHandler - ${message?.getName()}:${message?.getKey()} - Skipping unknown outbound domain event`);
        return;
      }
    }
  }

}
