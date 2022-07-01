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

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * ModusBox
 - Miguel de Barros <miguel.debarros@modusbox.com>
 - Roman Pietrzak <roman.pietrzak@modusbox.com>

 --------------
******/

'use strict'

import { ConsoleLogger, getEnvIntegerOrDefault, getEnvValueOrDefault } from '@mojaloop-poc/lib-utilities'
import * as RDKafka from 'node-rdkafka'
import { ILogger, IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageConsumer, Options } from './imessage_consumer'

export enum RdKafkaCommitMode {
  RDKAFKA_COMMIT_NO_WAIT = 'no-wait',
  RDKAFKA_COMMIT_MSG_SYNC = 'commit-msg-sync'
}

type RDKafkaConfig = {
  consumerConfig: RDKafka.ConsumerGlobalConfig
  topicConfig: RDKafka.ConsumerTopicConfig
  rdKafkaCommitWaitMode: RdKafkaCommitMode
}

export type RDKafkaConsumerOptions = Options<RDKafkaConfig>
export class RDKafkaConsumer extends MessageConsumer {
  protected _logger: ILogger
  private readonly _options: RDKafkaConsumerOptions
  private readonly _env_name: string
  private _client!: RDKafka.KafkaConsumer
  private _msgNames!: string[]

  constructor (options: RDKafkaConsumerOptions, logger?: ILogger) {
    super()

    // make a copy of the options
    this._options = { ...options }

    this._logger = logger ?? new ConsoleLogger()

    this._logger.isInfoEnabled() && this._logger.info('RDKafkaConsumer instance created')
  }

  async init (handlerCallback: (message: IDomainMessage) => Promise<void>, msgNames: string[] | null): Promise<void> {
    this._msgNames = msgNames == null ? [] : msgNames

    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('RDKafkaConsumer initialising...')
      if (this._msgNames.length > 0) {
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer filtering msg names to: ${this._msgNames.join(',')}`)
      } else {
        this._logger.isInfoEnabled() && this._logger.info('RDKafkaConsumer not filtering msg names (all will be received)')
      }

      const RDKAFKA_STATS_INT_MS = getEnvIntegerOrDefault('RDKAFKA_STATS_INT_MS', 0)

      /* Global config: Mix incoming config with default config */
      const defaultGlobalConfig: RDKafka.ConsumerGlobalConfig = {
        'statistics.interval.ms': RDKAFKA_STATS_INT_MS
        // event_cb: true,
        // debug // consumer,cgrp,topic,fetch
      }

      const debug = getEnvValueOrDefault('RDKAFKA_DEBUG_CONSUMER', null)
      if (debug !== null) {
        defaultGlobalConfig.debug = debug
      }

      const globalConfig = {
        ...defaultGlobalConfig,
        ...this._options.client.consumerConfig
      }

      /* Topic config: Mix incoming config with default config */
      const defaultTopicConfig: RDKafka.ConsumerTopicConfig = {
      }
      const topicConfig = {
        ...defaultTopicConfig,
        ...this._options.client.topicConfig
      }

      /* Start and connect the client */
      this._client = new RDKafka.KafkaConsumer(globalConfig, topicConfig)
      this._client.connect()

      this._client.on('ready', (info: RDKafka.ReadyInfo, metadata: RDKafka.Metadata) => {
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer::event.ready - info: ${JSON.stringify(info, null, 2)}`)
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer::event.ready - metadata: ${JSON.stringify(metadata)}`)
        // this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer::event.ready - metadata: ${JSON.stringify(metadata, null, 2)}`)
        resolve()
      })

      this._client.on('event.error', (error: RDKafka.LibrdKafkaError) => {
        this._logger.isErrorEnabled() && this._logger.error(`RDKafkaConsumer::event.error - ${JSON.stringify(error, null, 2)}`)
      })

      this._client.on('event.throttle', (eventData: any) => {
        this._logger.isWarnEnabled() && this._logger.warn(`RDKafkaConsumer::event.throttle - ${JSON.stringify(eventData, null, 2)}`)
      })

      // this._client.on('event.event', (eventData: any) => {
      //   this._logger.isErrorEnabled() && this._logger.error(`RDKafkaConsumer::event.event - ${JSON.stringify(eventData)}`)
      // })

      this._client.on('event.log', (eventData: any) => {
        this._logger.isDebugEnabled() && this._logger.debug(`RDKafkaConsumer::event.log - ${JSON.stringify(eventData, null, 2)}`)
      })

      /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
      this._client.on('event.stats', (eventData: any) => {
        /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer::event.stats - ${eventData.message}`)
      })

      this._client.on('disconnected', (metrics: RDKafka.ClientMetrics) => {
        this._logger.isErrorEnabled() && this._logger.error(`RDKafkaConsumer::event.disconnected - ${JSON.stringify(metrics, null, 2)}`)
      })

      const autoCommitEnabled = this._options.client.consumerConfig['enable.auto.commit']
      const commitWaitMode = this._options.client.rdKafkaCommitWaitMode

      /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
      this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer autoCommitEnabled is ${autoCommitEnabled}, commitWaitMode is ${commitWaitMode}`)

      const consumeRecursiveWrapper = (): void => {
        /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
        this._client.consume(1, async (err: RDKafka.LibrdKafkaError, messages: RDKafka.Message[]) => {
          if (err !== null) {
            this._logger.isErrorEnabled() && this._logger.error('RDKafkaConsumer got callback with err:', JSON.stringify(err))
          } else {
            if (messages.length > 0) {
              // this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer got callback with data: ${JSON.stringify(messages)}`)
              const msg = messages[0]
              const msgValue = msg?.value
              if (msg != null && msgValue != null) {
                if (this._msgNames.length > 0 && msg.headers !== undefined && msg.headers.length > 0) {
                  // unpack headers
                  const headersObj: { [key: string]: string } = {}
                  msg.headers.forEach((h) => {
                    for (const prop in h) {
                      headersObj[prop] = h[prop].toString()
                    }
                  })

                  if (headersObj.msgName !== undefined && !this._msgNames.includes(headersObj.msgName)) {
                    this._logger.isDebugEnabled() && this._logger.debug(`RDKafkaConsumer ignoring message with msgName: ${headersObj.msgName} not in the consumer list of subscribed msgNames`)
                    if (autoCommitEnabled !== true) {
                      // We are ignoring this message, but if we don't commit it and there will be no more messages that we can commit,
                      // then all the ignored messages will appear "stuck". Everything reports lag.
                      // Let's commit in NO_WAIT mode.
                      this._client.commitMessage(messages[0])
                    }
                    return consumeRecursiveWrapper()
                  }
                }
                // msgName in the list ov subscribed names or list is empty
                const msgAsString = msgValue.toString()
                let msgAsDomainMessage
                try {
                  msgAsDomainMessage = JSON.parse(msgAsString) as IDomainMessage

                  // if (msgAsDomainMessage.msgPartition == null) { // this doesn't make sense, should always be the partition we're getting it from
                  msgAsDomainMessage.msgPartition = msg.partition
                  // }
                  msgAsDomainMessage.msgOffset = msg.offset
                } catch (err) {
                  this._logger.isErrorEnabled() && this._logger.error('RDKafkaConsumer Error when JSON.parse()-ing message')
                }
                if (msgAsDomainMessage != null) {
                  await handlerCallback(msgAsDomainMessage)
                }
                // commit even if we couldn't parse it
                if (autoCommitEnabled !== true) {
                  switch (commitWaitMode) {
                    case RdKafkaCommitMode.RDKAFKA_COMMIT_NO_WAIT:
                      this._client.commitMessage(messages[0])
                      break
                    case RdKafkaCommitMode.RDKAFKA_COMMIT_MSG_SYNC:
                      this._client.commitMessageSync(messages[0])
                      break
                    default:
                      this._logger.isErrorEnabled() && this._logger.error('RDKafkaConsumer unknown commitWaitMode - no commits will happen!')
                  }
                }
              } else {
                this._logger.isErrorEnabled() && this._logger.error('RDKafkaConsumer Received message with value==NULL.')
              }
            }
          }
          // TODO - consider putting this in a setImmediate or process.nextTick (pedro)
          consumeRecursiveWrapper()
        })
      }

      this._client.on('ready', () => {
        this._logger.isInfoEnabled() && this._logger.info('RDKafkaConsumer ...connected !')
        this._logger.isInfoEnabled() && this._logger.info(`RDKafkaConsumer Subscribing to topics ${JSON.stringify(this._options.topics)}`)
        if (Array.isArray(this._options.topics)) {
          this._client.subscribe(this._options.topics)
        } else if (typeof this._options.topics === 'string') {
          this._client.subscribe([this._options.topics])
        }
        consumeRecursiveWrapper()
        resolve()
      })
    })
  }

  async destroy (forceCommit: boolean): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('RDKafkaConsumer disconnect()-ing...')
      this._client.disconnect((err: any, _data: RDKafka.ClientMetrics) => {
        if (err !== null) {
          this._logger.isErrorEnabled() && this._logger.error('RDKafkaConsumer disconnect() failed', err)
          reject(err)
        } else {
          resolve()
        }
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
