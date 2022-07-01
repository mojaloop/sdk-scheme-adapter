/**
 * Created by pedro.barreto@bynder.com on 17/Jan/2019.
 */

'use strict'

import * as kafka from 'kafka-node'
import * as async from 'async'
import { ConsoleLogger } from '@mojaloop-poc/lib-utilities'
import { ILogger, IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageConsumer, Options } from './imessage_consumer'
import { EnumProtocols, EnumOffset, EnumEncoding } from './kafka_generic_consumer'

export type KafkaStreamConsumerOptions = Options<kafka.ConsumerGroupOptions>

export class KafkaStreamConsumer extends MessageConsumer {
  private readonly _topics: string[]
  private _consumerGroup!: kafka.ConsumerGroupStream
  private _initialized: boolean = false
  private readonly _syncQueue: async.AsyncQueue<any> | undefined
  private readonly _options: KafkaStreamConsumerOptions

  private readonly _queue: any[] = []
  private _processing: boolean = false
  private _pauseForRebalanceRequested: boolean = false
  private _autoCommit: boolean = false
  private _handlerCallback!: (message: IDomainMessage) => Promise<void>

  protected _logger: ILogger

  constructor (options: KafkaStreamConsumerOptions, logger?: ILogger) {
    super()

    // make a copy of the options
    this._options = { ...options }

    let tempTopics
    if (typeof options.topics === 'string') {
      tempTopics = []
      tempTopics.push(options.topics)
    } else {
      tempTopics = options.topics
    }

    this._topics = tempTopics.map((topicName: string) => {
      return topicName
    })

    this._logger = logger ?? new ConsoleLogger()

    this._logger.isInfoEnabled() && this._logger.info('instance created')
  }

  static Create<tOptions> (options: tOptions, logger: ILogger): MessageConsumer {
    const consumer = Reflect.construct(this, arguments)

    consumer.on('error', (err: Error): void => {
      logger.isErrorEnabled() && logger.error(`event::error - ${JSON.stringify(err)}`)
    })

    // consumer.on('commit', (msgMetaData:any) => {
    //   logger.isInfoEnabled() && logger.info(`event::commit - ${JSON.stringify(msgMetaData)}`)
    // })

    return consumer
  }

  async destroy (forceCommit: boolean = false): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (this._consumerGroup != null) {
        this._consumerGroup?.close(() => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
  async init (handlerCallback: (message: IDomainMessage) => Promise<void>): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._logger.isInfoEnabled() && this._logger.info('initialising...')

      this._handlerCallback = handlerCallback

      const defaultConsumerGroupOptions: kafka.ConsumerGroupOptions = {
        sessionTimeout: 15000,
        // An array of partition assignment protocols ordered by preference.
        // 'roundrobin' or 'range' string for built ins (see below to pass in custom assignment protocol)
        groupId: 'notset',
        protocol: [EnumProtocols.ROUNDROBIN],
        autoCommit: false, // this._auto_commit,
        // Offsets to use for new groups other options could be 'earliest' or 'none' (none will emit an error if no offsets were saved)
        // equivalent to Java client's auto.offset.reset
        fromOffset: EnumOffset.LATEST, // "latest", // default is latest
        // outOfRangeOffset: 'earliest', // default is earliest
        // migrateHLC: false,    // for details please see Migration section below
        // migrateRolling: true,
        // migrateHLC: true, // default is false
        // migrateRolling: false, // default is true
        connectOnReady: true, // this._connect_on_ready,
        // connectOnReady: false // this._connect_on_ready,
        highWaterMark: 500, // TODO move to config
        // // paused: true
        // kafkaHost: 'localhost:9092', // connect directly to kafka broker (instantiates a KafkaClient)
        batch: undefined, // put client batch settings if you need them
        // ssl: true, // optional (defaults to false) or tls options hash
        encoding: EnumEncoding.UTF8, // default is utf8, use 'buffer' for binary data
        // commitOffsetsOnFirstJoin: true, // on the very first time this consumer group subscribes to a topic, record the offset returned in fromOffset (latest/earliest)
        // how to recover from OutOfRangeOffset error (where save offset is past server retention) accepts same value as fromOffset
        // outOfRangeOffset: 'earliest', // default
        // Callback to allow consumers with autoCommit false a chance to commit before a rebalance finishes
        // isAlreadyMember will be false on the first connection, and true on rebalances triggered after that
        // @ts-expect-error
        onRebalance: (isAlreadyMember: boolean, callback: () => void): void => {
          // TODO wait until we ar enot processing and everything is commited before returning
          this._logger.isInfoEnabled() && this._logger.info(`Rebalance received - isAlreadyMember: ${isAlreadyMember ? 'true' : 'false'} - AutoCommit: ${this._autoCommit ? 'true' : 'false'}`)

          if (!isAlreadyMember || this._autoCommit) {
            this._logger.isInfoEnabled() && this._logger.info('Rebalance - not already a member or autocommit is true, ignoring')
            return callback()
          }

          if (!this._processing) {
            this._logger.isInfoEnabled() && this._logger.info('Rebalance - not processing, ignoring')
            return callback()
          }

          this._pauseForRebalanceRequested = true

          // eslint-disable-next-line no-unexpected-multiline,no-void
          void (async () => {
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type,promise/param-names
            const sleep = async (m: number) => await new Promise(r => setTimeout(r, m))

            while (this._processing) {
              this._logger.isWarnEnabled() && this._logger.warn('Rebalance - processing active, waiting...')
              await sleep(200)
            }
            this._logger.isWarnEnabled() && this._logger.warn('Rebalance - processing complete, calling callback ...')
            // now we can resume
            this._pauseForRebalanceRequested = false
            this._consumerGroup.resume()
            callback()
          })()
        }
      }

      // copy default config
      const consumerGroupOptions = { ...defaultConsumerGroupOptions }
      // override any values with the options given to the client
      Object.assign(consumerGroupOptions, this._options.client)

      this._autoCommit = consumerGroupOptions.autoCommit ?? false

      this._logger.isDebugEnabled() && this._logger.debug(`options: \n${JSON.stringify(consumerGroupOptions)}`)

      this._consumerGroup = new kafka.ConsumerGroupStream(
        consumerGroupOptions as kafka.ConsumerGroupOptions, this._topics
      )

      this._consumerGroup.on('error', (err: Error) => {
        this._logger.isErrorEnabled() && this._logger.error(err, ' - consumer error')
        process.nextTick(() => {
          this.emit('error', err)
        })
      })

      this._consumerGroup.on('offsetOutOfRange', (err) => {
        this._logger.isErrorEnabled() && this._logger.error(err, ' - offsetOutOfRange consumer error')
        process.nextTick(() => {
          this.emit('error', err)
        })
      })

      this._consumerGroup.on('connect', () => {
        if (!this._initialized) {
          this._logger.isInfoEnabled() && this._logger.info('first on connect')
        } else {
          this._logger.isInfoEnabled() && this._logger.info('on connect - (re)connected')
        }
      })

      this._consumerGroup.consumerGroup.client.on('ready', () => {
        this._logger.isInfoEnabled() && this._logger.info('on ready')
        if (!this._initialized) {
          this._logger.isInfoEnabled() && this._logger.info('first on ready')

          this._initialized = true
          process.nextTick(() => {
            resolve()
          })
        } else {
          this._logger.isInfoEnabled() && this._logger.info('on ready - (re)ready')
        }
      })

      this._consumerGroup.consumerGroup.client.on('reconnect', () => {
        this._logger.isInfoEnabled() && this._logger.info('on reconnect')
      })

      // this.on('commit', (data) => {
      //   this._logger.isInfoEnabled() && logger.info(`commit - ${JSON.stringify(data)}`)
      // })

      // hook on message
      // this._consumerGroup.on('message', this.onMessage.bind(this))
      this._consumerGroup.on('data', this._onMessage.bind(this))

      // TODO need a timeout for this on-ready
    })
  }

  connect (): void {
    (this._consumerGroup as any).connect()
  }

  pause (): void {
    this._consumerGroup.pause()
  }

  resume (): void {
    this._consumerGroup.resume()
  }

  disconnect (): void {
    this._consumerGroup.close(() => {
    })
  }

  private _onMessage (message: any): void {
    this._processing = true
    this._consumerGroup.pause()

    const msgMetaData = {
      key: message?.message?.key,
      timestamp: message?.message?.timestamp,
      topic: message.message?.topic,
      partition: message?.message?.partition,
      offset: message?.message?.offset,
      highWaterOffset: message?.message?.highWaterOffset
    }

    let domainMessage

    try {
      domainMessage = JSON.parse(message.value) as IDomainMessage
      if (domainMessage.msgPartition == null) {
        domainMessage.msgPartition = msgMetaData.partition
      }
    } catch (err) {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error parsing kafka message')
      this.emit('error', err)

      this._processing = false
      if (!this._pauseForRebalanceRequested) {
        this._consumerGroup.resume()
      }
      return
    }

    this._handlerCallback(domainMessage).then(value => {
      // not much
      // eslint-disable-next-line no-debugger
      // debugger
    }).catch((err: Error) => {
      this._logger.isErrorEnabled() && this._logger.error(err, 'Error handing message')
    }).finally(() => {
      if (!this._autoCommit) {
        // there should never be a pending commit, so we can call force commit
        this._consumerGroup.commit(message, true, (err: any) => {
          if (err != null) {
            this._logger.isErrorEnabled() && this._logger.error(err)
          } else {
            this.emit('commit', msgMetaData)
          }

          if (!this._pauseForRebalanceRequested) {
            this._consumerGroup.resume()
          } else {
            // eslint-disable-next-line no-debugger
            debugger
          }
          this._processing = false
        })
      } else {
        if (!this._pauseForRebalanceRequested) {
          this._consumerGroup.resume()
        } else {
          // eslint-disable-next-line no-debugger
          debugger
        }
        this._processing = false
      }
    })
  }
}
