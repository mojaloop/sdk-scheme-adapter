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

import * as kafka from 'kafka-node'
import { ConsoleLogger } from '@mojaloop-poc/lib-utilities'
import { ILogger, IMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageProducer, Options, iMessageProducer } from './imessage_producer'
// import { murmur2 } from 'murmurhash-js'

// ref: https://github.com/vuza/murmur2-partitioner/blob/master/index.js
// const SEED = 0x9747b28c
// function _toPositive (n: number): number {
//   return n & 0x7fffffff
// }
//
// function partitioner (partitions: number[], key: string | Buffer): number {
//   key = Buffer.isBuffer(key) ? key.toString() : key
//   return _toPositive(murmur2(key, SEED)) % partitions.length
// }

export enum KafkaNodeCompressionTypes {
  None = 0,
  GZIP = 1,
  Snappy = 2
}

export type KafkaOptions = {
  kafka?: kafka.KafkaClientOptions
  producer?: kafka.ProducerOptions
  compression?: KafkaNodeCompressionTypes
}

export type KafkaGenericProducerOptions = Options<KafkaOptions>

enum PartitionerType {
  DEFAULT,
  RANDOM,
  CYCLIC,
  KEYED,
  CUSTOM
}

export class KafkaGenericProducer extends MessageProducer {
  protected _logger: ILogger
  private _client!: kafka.KafkaClient
  private _producer!: kafka.HighLevelProducer
  private readonly _knownTopics = new Map<string, boolean>()
  private readonly _options: KafkaGenericProducerOptions

  constructor (options: KafkaGenericProducerOptions, logger?: ILogger) {
    super()

    // make a copy of the options
    this._options = { ...options }

    this._logger = logger ?? new ConsoleLogger()

    this._logger.isInfoEnabled() && this._logger.info('KafkaGenericProducer instance created')
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
    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('initialising...')

      const defaultClientOptions: kafka.KafkaClientOptions = {
        connectTimeout: 10000, // in ms it takes to wait for a successful connection before moving to the next host default: 10000
        requestTimeout: 30000, // in ms for a kafka request to timeout default: 30000
        autoConnect: true, // automatically connect when KafkaClient is instantiated otherwise you need to manually call connect default: true
        // connectRetryOptions: RetryOptions, // object hash that applies to the initial connection. see retry module for these options.
        // sslOptions: any,
        clientId: 'notset',
        // idleConnection: number, // allows the broker to disconnect an idle connection from a client (otherwise the clients continues to O after being disconnected). The value is elapsed time in ms without any data written to the TCP socket. default: 5 minutes
        reconnectOnIdle: true, // when the connection is closed due to client idling, client will attempt to auto-reconnect. default: true
        maxAsyncRequests: 10 // maximum async operations at a time toward the kafka cluster. default: 10
        // sasl: any //Object, SASL authentication configuration (only SASL/PLAIN is currently supported), ex. { mechanism: 'plain', username: 'foo', password: 'bar' } (Kafka 0.10+)
      }

      // copy default config
      const clientOptions = { ...defaultClientOptions }
      // override any values with the options given to the client
      Object.assign(clientOptions, this._options.client.kafka)

      this._logger.isDebugEnabled() && this._logger.debug(`clientOptions: \n${JSON.stringify(clientOptions)}`)

      const defaultProducerOptions: kafka.ProducerOptions = {
        requireAcks: -1, // https://github.com/SOHU-Co/kafka-node/blob/master/lib/baseProducer.js#L44
        ackTimeoutMs: 100,
        partitionerType: PartitionerType.KEYED
      }

      // copy default config
      const producerOptions = { ...defaultProducerOptions }
      // override any values with the options given to the client
      Object.assign(producerOptions, this._options.client.producer)

      this._logger.isDebugEnabled() && this._logger.debug(`producerOptions: \n${JSON.stringify(producerOptions)}`)

      // const kafkaClientOptions: kafka.KafkaClientOptions = {
      //   kafkaHost: this._kafka_conn_str,
      //   clientId: this._kafka_client_name
      // }

      this._client = new kafka.KafkaClient(clientOptions)
      // this._producer = new kafka.HighLevelProducer(this._client, { partitionerType: 4 }, partitioner)
      // this._producer = new kafka.HighLevelProducer(this._client, { partitionerType: 3 })
      this._producer = new kafka.HighLevelProducer(this._client, producerOptions)

      this._producer.on('ready', async () => {
        this._logger.isInfoEnabled() && this._logger.info('KafkaProducer ready!')

        // force refresh metadata to avoid BrokerNotAvailableError on first request
        // https://www.npmjs.com/package/kafka-node#highlevelproducer-with-keyedpartitioner-errors-on-first-send

        this._client.refreshMetadata([], async (err: Error) => {
          if (err != null) {
            this._logger.isErrorEnabled() && this._logger.error(err, ' - error refreshMetadata()')
            return reject(err)
          }

          resolve()
        })
      })

      this._producer.on('error', (err: Error) => {
        this._logger.isErrorEnabled() && this._logger.error(err, 'KafkaProducer on error')
      })
    })
  }

  async destroy (): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (this._producer != null) {
        this._producer?.close(() => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  async send (kafkaMessages: IMessage | IMessage[] | any): Promise<void> {
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    return await new Promise(async (resolve, reject) => {
      if (!Array.isArray(arguments[0])) { kafkaMessages = [arguments[0]] as IMessage[] }

      // const msgsByTopic: Map<string, kafka.KeyedMessage[]> = new Map<string, kafka.KeyedMessage[]>()
      const payloads: any[] = []

      // iterate the messages to parse and check them, and fill _knownTopics with first time topics
      kafkaMessages.forEach((kafkaMsg: IMessage) => {
        if (kafkaMsg.msgTopic == null) { throw new Error(`Invalid topic for message: ${kafkaMsg?.msgType}`) }

        let msg: string
        // let topic = this._env_name + "_"+ kafkaMsg.header.msgTopic; // prefix envName on all topics
        const topic = kafkaMsg.msgTopic
        const key = kafkaMsg.msgKey

        try {
          msg = JSON.stringify(kafkaMsg)
        } catch (e) {
          this._logger.isErrorEnabled() && this._logger.error(e, +' - error parsing message')
          return process.nextTick(() => {
            reject(new Error('KafkaProducer - Error parsing message'))
          })
        }

        if (msg == null) {
          this._logger.isErrorEnabled() && this._logger.error('invalid message in send_message')
          return process.nextTick(() => {
            reject(new Error('KafkaProducer - invalid or empty message'))
          })
        }

        // check for known topic and add null if not there
        // if (!this._knownTopics.has(topic)) { this._knownTopics.set(topic, false) }

        const km = new kafka.KeyedMessage(key, msg)
        payloads.push({ topic: topic, messages: km, key: key, attributes: this._options.client.compression })
      })

      this._producer.send(payloads, (err?: Error | null, data?: any) => {
        if (err != null) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'KafkaGenericProducer error sending message')
          return reject(err)
        }
        this._logger.isDebugEnabled() && this._logger.debug('KafkaGenericProducer sent message - response:', data)
        resolve(data)
      })
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
