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

import { ConsoleLogger } from '@mojaloop-poc/lib-utilities'
import { ILogger, IMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageProducer, Options, iMessageProducer } from './imessage_producer'
import { CompressionTypes as _CompressionTypes, TopicMessages, logLevel, Producer, Partitioners, ProducerConfig, KafkaConfig, Kafka as Kafkajs, CompressionTypes } from 'kafkajs'
export { CompressionTypes as KafkaJsCompressionTypes } from 'kafkajs'

export enum KafkajsAcks {
  ALL = -1,
  NONE = 0,
  LEADER = 1
}

type KafkajsConfig = {
  client: KafkaConfig
  producer: ProducerConfig
  acks?: KafkajsAcks
  timeout?: number
  compression?: CompressionTypes
}

export type KafkaJsProducerOptions = Options<KafkajsConfig>
export class KafkajsProducer extends MessageProducer {
  protected _logger: ILogger
  private _client!: Kafkajs
  private _producer!: Producer
  private readonly _knownTopics = new Map<string, boolean>()
  private readonly _options: KafkaJsProducerOptions
  private _defaultedKafkajsConfig: KafkajsConfig

  constructor (options: KafkaJsProducerOptions, logger?: ILogger) {
    super()

    // make a copy of the options
    this._options = { ...options }

    this._logger = logger ?? new ConsoleLogger()

    this._logger.isInfoEnabled() && this._logger.info('KafkaJsProducer instance created')
  }

  static Create<tOptions> (options: tOptions, logger: ILogger): iMessageProducer {
    const producer = Reflect.construct(this, arguments)

    producer.on('error', (err: Error): void => {
      logger.isErrorEnabled() && logger.error(`event::error - ${JSON.stringify(err)}`)
    })

    return producer
  }

  private readonly _env_name: string

  get envName (): string {
    return this._env_name
  }

  async init (): Promise<void> {
    this._logger.isInfoEnabled() && this._logger.info('initialising...')

    const defaultKafkajsOptions: KafkajsConfig = {
      client: { // https://kafka.js.org/docs/configuration#options
        brokers: ['localhost:9092'],
        // connectionTimeout: 3000,
        // requestTimeout: 25000,
        // authenticationTimeout: 1000,
        // reauthenticationThreshold: 10000
        logLevel: logLevel.ERROR
      },
      producer: { // https://kafka.js.org/docs/producing#options
        createPartitioner: Partitioners.JavaCompatiblePartitioner,
        // retry: null,
        metadataMaxAge: 300000,
        allowAutoTopicCreation: true,
        idempotent: false, // false is default
        // transactionalId?: string // cant find much about this?
        transactionTimeout: 60000
        // maxInFlightRequests: 1 // default is unlimited
      },
      acks: KafkajsAcks.ALL,
      timeout: 30000,
      compression: _CompressionTypes.None
    }

    // copy default config
    const KafkajsOptions: KafkajsConfig = { ...defaultKafkajsOptions }
    // override any values with the options given to the client
    Object.assign(KafkajsOptions, this._options.client)

    this._defaultedKafkajsConfig = Object.assign({}, KafkajsOptions)

    this._logger.isDebugEnabled() && this._logger.debug(`Producer options: \n${JSON.stringify(KafkajsOptions)}`)

    this._client = new Kafkajs(KafkajsOptions.client)
    this._producer = this._client.producer()
  }

  async destroy (): Promise<void> {
    await this._producer.disconnect()
  }

  async send (kafkaMessages: IMessage | IMessage[] | any): Promise<void> {
    if (!Array.isArray(arguments[0])) { kafkaMessages = [arguments[0]] as IMessage[] }

    const payloadsForEachTopic: {
      [key: string]: TopicMessages
    } = {}

    kafkaMessages.forEach((kafkaMsg: IMessage) => {
      if (payloadsForEachTopic[kafkaMsg.msgTopic] == null || !Array.isArray(payloadsForEachTopic[kafkaMsg.msgTopic].messages)) {
        payloadsForEachTopic[kafkaMsg.msgTopic] = {
          topic: kafkaMsg.msgTopic,
          messages: []
        }
      }
      let message: any
      if (kafkaMsg.msgPartition !== null) {
        message = {
          key: kafkaMsg.msgKey,
          value: JSON.stringify(kafkaMsg),
          partition: kafkaMsg.msgPartition
          // headers?: IHeaders
          // timestamp?: string
        }
      } else {
        message = {
          key: kafkaMsg.msgKey,
          value: JSON.stringify(kafkaMsg)
        }
      }
      payloadsForEachTopic[kafkaMsg.msgTopic].messages.push(message)
    })

    const topicMessages = Object.values(payloadsForEachTopic)

    await this._producer.sendBatch({
      topicMessages,
      // # Ref: https://kafka.js.org/docs/producing#options
      acks: this._defaultedKafkajsConfig.acks,
      timeout: this._defaultedKafkajsConfig.timeout,
      compression: this._defaultedKafkajsConfig.compression
    })
  }

  connect (): void {
    throw new Error('Method not implemented.')
  }

  pause (): void {
    throw new Error('Method not implemented.')
  }

  resume (): void {
    throw new Error('Method not implemented.')
  }

  disconnect (): void {
    throw new Error('Method not implemented.')
  }
}
