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

import { ConsoleLogger, getEnvIntegerOrDefault, getEnvValueOrDefault } from '@mojaloop-poc/lib-utilities'
import { ILogger, IMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageProducer, Options } from './imessage_producer'
import * as RDKafka from 'node-rdkafka'
import { NumberNullUndefined } from 'node-rdkafka'

type RDKafkaConfig = {
  producerConfig: RDKafka.ProducerGlobalConfig
  topicConfig: RDKafka.ProducerTopicConfig
}

export enum RDKafkaPartioner {
  RANDOM = 'random',
  CONSISTENT = 'consistent',
  RANDOM_CONSISTENT = 'consistent_random',
  MURMUR2 = 'murmur2',
  MURMUR2_RANDOM = 'murmur2_random',
  FNV1A = 'fnv1a',
  FNV1A_RANDOM = 'fnv1a_random'
}

export enum RDKafkaCompressionTypes {
  NONE = 'none',
  GZIP = 'gzip',
  SNAPPY = 'snappy',
  LZ4 = 'lz4',
  ZSTD = 'zstd'
}

export type RDKafkaProducerOptions = Options<RDKafkaConfig>
export class RDKafkaProducer extends MessageProducer {
  protected _logger: ILogger
  private readonly _options: RDKafkaProducerOptions
  private readonly _env_name: string
  private _client!: RDKafka.HighLevelProducer

  constructor (options: RDKafkaProducerOptions, logger?: ILogger) {
    super()

    // make a copy of the options
    this._options = { ...options }

    this._logger = logger ?? new ConsoleLogger()

    this._logger.isInfoEnabled() && this._logger.info('RDKafkaProducer instance created')
  }

  get envName (): string {
    return this._env_name
  }

  async init (): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('RDKafkaProducer initialising...')

      const RDKAFKA_STATS_INT_MS = getEnvIntegerOrDefault('RDKAFKA_STATS_INT_MS', 0)

      /* Global config: Mix incoming config with default config */
      const defaultGlobalConfig: RDKafka.ProducerGlobalConfig = {
        'statistics.interval.ms': RDKAFKA_STATS_INT_MS
        // event_cb: true,
        // debug // broker,topic,msg
      }

      const debug = getEnvValueOrDefault('RDKAFKA_DEBUG_PRODUCER', null)
      if ((debug !== null) && (debug !== '')) {
        defaultGlobalConfig.debug = debug
      }

      const globalConfig = {
        ...defaultGlobalConfig,
        ...this._options.client.producerConfig
      }

      /* Add config from environmental variables */
      const RDKAFKA_BATCH_NUM_MESSAGES = getEnvIntegerOrDefault('RDKAFKA_BATCH_NUM_MESSAGES', null)
      const RDKAFKA_QUEUE_BUFFERING_MAX_US = getEnvIntegerOrDefault('RDKAFKA_QUEUE_BUFFERING_MAX_US', null)
      const RDKAFKA_METADATA_REFRESH_INTERVAL_MS = getEnvIntegerOrDefault('RDKAFKA_METADATA_REFRESH_INTERVAL_MS', null)
      if (RDKAFKA_BATCH_NUM_MESSAGES != null) {
        globalConfig['batch.num.messages'] = RDKAFKA_BATCH_NUM_MESSAGES
      }
      if (RDKAFKA_QUEUE_BUFFERING_MAX_US != null) {
        globalConfig['queue.buffering.max.ms'] = RDKAFKA_QUEUE_BUFFERING_MAX_US * 0.001
      }
      if (RDKAFKA_METADATA_REFRESH_INTERVAL_MS != null) {
        globalConfig['topic.metadata.refresh.interval.ms'] = RDKAFKA_METADATA_REFRESH_INTERVAL_MS
      }

      /* Topic config: Mix incoming config with default config */
      const defaultTopicConfig: RDKafka.ProducerGlobalConfig = {
      }
      const topicConfig = {
        ...defaultTopicConfig,
        ...this._options.client.topicConfig
      }

      this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer starting with following globalConfig: ${JSON.stringify(globalConfig)}`)
      this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer starting with following topicConfig: ${JSON.stringify(topicConfig)}`)

      /* Start and connect the client */
      this._client = new RDKafka.HighLevelProducer(globalConfig, topicConfig)
      this._client.connect(undefined, (err: RDKafka.LibrdKafkaError | null, data: RDKafka.Metadata) => {
        if (err !== null) {
          this._logger.isErrorEnabled() && this._logger.error('RDKafkaProducer::connect - failed to connect with error:', err)
          reject(err)
        }
      })

      this._client.on('ready', (info: RDKafka.ReadyInfo, metadata: RDKafka.Metadata) => {
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer::event.ready - info: ${JSON.stringify(info, null, 2)}`)
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer::event.ready - metadata: ${JSON.stringify(metadata)}`)
        // this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer::event.ready - metadata: ${JSON.stringify(metadata, null, 2)}`)
        resolve()
      })

      this._client.on('event.error', (error: RDKafka.LibrdKafkaError) => {
        this._logger.isErrorEnabled() && this._logger.error(`RDKafkaProducer::event.error - ${JSON.stringify(error, null, 2)}`)
      })

      this._client.on('event.throttle', (eventData: any) => {
        this._logger.isWarnEnabled() && this._logger.warn(`RDKafkaProducer::event.throttle - ${JSON.stringify(eventData, null, 2)}`)
      })

      // this._client.on('event.event', (eventData: any) => {
      //   this._logger.isErrorEnabled() && this._logger.error(`RDKafkaProducer::event.event - ${JSON.stringify(eventData)}`)
      // })

      this._client.on('event.log', (eventData: any) => {
        this._logger.isDebugEnabled() && this._logger.debug(`RDKafkaProducer::event.log - ${JSON.stringify(eventData, null, 2)}`)
      })

      /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
      this._client.on('event.stats', (eventData: any) => {
        /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaProducer::event.stats - ${eventData.message}`)
      })

      this._client.on('disconnected', (metrics: RDKafka.ClientMetrics) => {
        this._logger.isErrorEnabled() && this._logger.error(`RDKafkaProducer::event.disconnected - ${JSON.stringify(metrics, null, 2)}`)
      })
    })
  }

  async destroy (): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('RDKafkaProducer::destroy - disconnect()-ing...')
      this._client.disconnect((err: any, _data: RDKafka.ClientMetrics) => {
        if (err !== null) {
          this._logger.isErrorEnabled() && this._logger.error('RDKafkaProducer::destroy disconnect() failed', err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  connect (): void {
    throw new Error('Method connect() not implemented.')
  }

  pause (): void {
    throw new Error('Method pause() not implemented.')
  }

  resume (): void {
    throw new Error('Method resume() not implemented.')
  }

  disconnect (): void {
    throw new Error('Method disconnect() not implemented.')
  }

  async send (kafkaMessages: IMessage | IMessage[] | any): Promise<void> {
    return await new Promise((resolve, reject) => {
      /*
      if ((Array.isArray(arguments[0])) && (kafkaMessages.length > 1)) {
        this._logger.isErrorEnabled() && this._logger.error('RDKafkaProducer::send() Sending more than 1 message in one go is not supported yet.')
        throw new Error('RDKafkaProducer::send() Sending more than 1 message in one go is not supported yet.')
        // DONE: the callback in produce() should be reworked, to call resolve() after receiving ACK-s for all messages.
      }
      */
      const messages: IMessage[] = !Array.isArray(arguments[0]) ? [arguments[0]] as IMessage[] : arguments[0]

      let rejected = false
      let acksRemaining: number = messages.length

      messages.forEach((kafkaMsg: IMessage) => {
        try {
          const msg = JSON.stringify(kafkaMsg)
          const partition = (kafkaMsg.msgPartition !== null) ? kafkaMsg.msgPartition : null
          const headers = [
            { msgType: kafkaMsg.msgType === undefined ? '' : kafkaMsg.msgType.toString() },
            { msgName: kafkaMsg.msgName === undefined ? '' : kafkaMsg.msgName },
            { msgKey: kafkaMsg.msgKey === undefined ? '' : kafkaMsg.msgKey }
          ]

          this._client.produce(
            /* topic name */
            kafkaMsg.msgTopic,
            /* partiton - if manually specified otherwise null */
            partition,
            /* msg in form a buffer */
            Buffer.from(msg, 'utf-8'),
            /* key */
            kafkaMsg.msgKey,
            /* timestamp */
            null,
            /* headers */
            // @ts-expect-error
            headers,
            /* callback */
            (err: any, _offset?: NumberNullUndefined) => {
              if (err !== null) {
                this._logger.isErrorEnabled() && this._logger.error(err, 'Error getting aks from publisher')
                if (!rejected) {
                  rejected = true
                  reject(err)
                }
              } else {
                acksRemaining--
                if (acksRemaining <= 0) {
                  resolve()
                }
              }
            }
          )
        } catch (err) {
          this._logger.isErrorEnabled() && this._logger.error('RDKafkaProducer::send ...error !', err)
          throw err
        }
      })
    })
  }
}
