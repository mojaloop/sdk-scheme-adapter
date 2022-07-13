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
import { IRunHandler, KafkaCommandEventsConsumer, KafkaDomainEventsProducer } from '@mojaloop/sdk-scheme-adapter-infra-lib'
import { CommandEventMessage, OutboundCommandEventMessageName, ICommandEventMessageData, ProcessSDKOutboundBulkRequestMessage, IProcessSDKOutboundBulkRequestMessageData } from '@mojaloop/sdk-scheme-adapter-private-types-lib';
import { Crypto } from '@mojaloop/sdk-scheme-adapter-utilities-lib'
import { BulkTransactionEntity } from '../domain/bulk_transaction_entity'
import { BulkTransactionAgg } from '../domain/bulk_transaction_agg'
import { IBulkTransactionEntityRepo } from '../domain/bulk_transaction_entity_repo'
import { RedisBulkTransactionStateRepo } from '../infrastructure/redis_bulk_transaction_repo'


export class OutboundEventHandler implements IRunHandler {
  private _logger: ILogger
  private _consumer: KafkaCommandEventsConsumer
  private _domainProducer: KafkaDomainEventsProducer
  private _clientId: string
  private _bulkTransactionEntityStateRepo: IBulkTransactionEntityRepo

  async start (appConfig: any, logger: ILogger): Promise<void> {
    this._logger = logger
    this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler::start - appConfig=${JSON.stringify(appConfig)}`)
    this._clientId = `outboundCmdHandler-${appConfig.kafka.consumer as string}-${Crypto.randomBytes(8)}`

    // this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Creating repo of type ${MongoDbReadsideTransferRepo.constructor.name}`)
    // this._readSideRepo = new MongoDbReadsideTransferRepo(appConfig.readside_store.uri, logger)
    // await this._readSideRepo.init()

    // this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Created repo of type ${this._readSideRepo.constructor.name}`)

    this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Creating ${appConfig.kafka.consumer as string}...`)

    this._consumer = new KafkaCommandEventsConsumer(this._messageHandler.bind(this), logger)
    logger.isInfoEnabled() && logger.info(`outboundCmdHandler - Created kafkaConsumer of type ${this._consumer.constructor.name}`)
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    await this._consumer.init() // we're interested in all stateEvents
    await this._consumer.start()

    this._domainProducer = new KafkaDomainEventsProducer(logger)
    logger.isInfoEnabled() && logger.info(`outboundCmdHandler - Created kafkaProducer of type ${this._domainProducer.constructor.name}`)
    await this._domainProducer.init()

    // TODO: Parameterize redis config
    this._bulkTransactionEntityStateRepo = new RedisBulkTransactionStateRepo('redis://localhost:6379', false, this._logger)
    logger.isInfoEnabled() && logger.info(`outboundCmdHandler - Created BulkTransactionStateRepo of type ${this._bulkTransactionEntityStateRepo.constructor.name}`)
    await this._bulkTransactionEntityStateRepo.init()


  }

  async destroy (): Promise<void> {
    await this._consumer.destroy()
    await this._domainProducer.destroy()
    await this._bulkTransactionEntityStateRepo.destroy()
  }

  async _messageHandler (message: CommandEventMessage): Promise<void> {
    this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - ${message.getName()}`)
    console.log(message)
    switch (message.getName()) {
      case OutboundCommandEventMessageName.ProcessSDKOutboundBulkRequest: {
        const processSDKOutboundBulkRequestMessage = ProcessSDKOutboundBulkRequestMessage.CreateFromCommandEventMessage(message)
        try {
          const sdkOutboundBulkRequestEntity = processSDKOutboundBulkRequestMessage.createSDKOutboundBulkRequestEntity()
          this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Got SDKOutboundBulkRequestEntity ${sdkOutboundBulkRequestEntity}`);
          // console.log(sdkOutboundBulkRequestEntity.exportState());
          // const bulkTransactionEntity = BulkTransactionEntity.CreateFromRequest(sdkOutboundBulkRequestEntity.request)
          // this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Created BulkTransactionEntity ${bulkTransactionEntity}`);
          // console.log(bulkTransactionEntity.exportState());

          // Create aggregate
          // const bulkTransactionAgg = new BulkTransactionAgg(bulkTransactionEntity, this._bulkTransactionEntityStateRepo, this._logger)
          const bulkTransactionAgg = BulkTransactionAgg.CreateFromRequest(sdkOutboundBulkRequestEntity.request, this._bulkTransactionEntityStateRepo, this._logger)
          this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Created BulkTransactionAggregate ${bulkTransactionAgg}`);
          bulkTransactionAgg.store()
        } catch(err: any) {
          this._logger.isInfoEnabled() && this._logger.info(`outboundCmdHandler - Failed to create BulkTransactionAggregate. ${err.message}`)
        }
        break;
      }
      default: {
        this._logger.isDebugEnabled() && this._logger.debug(`outboundCmdHandler - ${message?.getName()}:${message?.getKey()} - Skipping unknown outbound domain event`);
        return;
      }
    }
  }
}
 