/**
 * Created by pedro.barreto@bynder.com on 17/Jan/2019.
 */
'use strict'

import * as kafka from 'kafka-node'
import * as async from 'async'
import { ConsoleLogger } from '@mojaloop-poc/lib-utilities'
import { ILogger, IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MessageConsumer, Options } from './imessage_consumer'

export enum EnumOffset {
  LATEST= 'latest',
  EARLIEST= 'earliest',
  NONE = 'none'
}

export enum EnumEncoding {
  UTF8 = 'utf8',
  BUFFER = 'buffer'
}

export enum EnumProtocols {
  ROUNDROBIN='roundrobin',
  RAGE='range'
}

export type KafkaGenericConsumerOptions = Options<kafka.ConsumerGroupOptions>
// export class KafkaGenericConsumer extends EventEmitter implements MessageConsumer {
export class KafkaGenericConsumer extends MessageConsumer {
  private readonly _topics: string[]
  private _consumerGroup!: kafka.ConsumerGroup
  private _initialized: boolean = false
  private _syncQueue: async.AsyncQueue<any> | undefined
  private readonly _options: KafkaGenericConsumerOptions

  private readonly _queue: any[] = []
  private _processing: boolean = false
  private _handlerCallback!: (message: IDomainMessage) => Promise<void>

  protected _logger: ILogger

  constructor (options: KafkaGenericConsumerOptions, logger?: ILogger) {
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
        this._consumerGroup?.close(forceCommit, () => {
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
        // // paused: true
        // kafkaHost: 'localhost:9092', // connect directly to kafka broker (instantiates a KafkaClient)
        batch: undefined, // put client batch settings if you need them
        // ssl: true, // optional (defaults to false) or tls options hash
        encoding: EnumEncoding.UTF8 // default is utf8, use 'buffer' for binary data
        // commitOffsetsOnFirstJoin: true, // on the very first time this consumer group subscribes to a topic, record the offset returned in fromOffset (latest/earliest)
        // how to recover from OutOfRangeOffset error (where save offset is past server retention) accepts same value as fromOffset
        // outOfRangeOffset: 'earliest', // default
        // Callback to allow consumers with autoCommit false a chance to commit before a rebalance finishes
        // isAlreadyMember will be false on the first connection, and true on rebalances triggered after that
        // onRebalance: (isAlreadyMember, callback) => { callback(); } // or null
      }

      // copy default config
      const consumerGroupOptions = { ...defaultConsumerGroupOptions }
      // override any values with the options given to the client
      Object.assign(consumerGroupOptions, this._options.client)

      this._logger.isDebugEnabled() && this._logger.debug(`options: \n${JSON.stringify(consumerGroupOptions)}`)

      this._consumerGroup = new kafka.ConsumerGroup(
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

          this._initialized = true
          process.nextTick(() => {
            resolve()
          })
        } else {
          this._logger.isInfoEnabled() && this._logger.info('on connect - (re)connected')
        }
      })

      this._consumerGroup.client.on('ready', () => {
        this._logger.isInfoEnabled() && this._logger.info('on ready')
      })

      this._consumerGroup.client.on('reconnect', () => {
        this._logger.isInfoEnabled() && this._logger.info('on reconnect')
      })

      // this.on('commit', (data) => {
      //   this._logger.isInfoEnabled() && this._logger.info(`commit - ${JSON.stringify(data)}`)
      // })

      // hook on message
      // this._consumerGroup.on('message', this.messageHandler.bind(this));

      this._consumerGroup.on('message', (message: any) => {
        const logger = this._logger
        // this._logger.isInfoEnabled() && this._logger.info(`MESSAGE:${JSON.stringify(message)}`)
        if (this._syncQueue == null) throw new Error('Async queue has not been defined!')
        this._syncQueue.push({ message }, function (err) {
          if (err != null) {
            logger.isErrorEnabled() && logger.error(`Consumer::_consumePoller()::syncQueue.push - error: ${JSON.stringify(err)}`)
          }
        })
      })
      this._logger.isInfoEnabled() && this._logger.info('async queue created')

      /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
      this._syncQueue = async.queue(async (message) => {
        this._processing = true
        // this._logger.isDebugEnabled() && logger.debug(`async::queue() - message: ${JSON.stringify(message)}`)

        const msgMetaData = {
          key: message?.message?.key,
          timestamp: message?.message?.timestamp,
          topic: message.message?.topic,
          partition: message?.message?.partition,
          offset: message?.message?.offset,
          highWaterOffset: message?.message?.highWaterOffset,
          commitResult: undefined
        }

        try {
          const domainMessage = JSON.parse(message.message.value) as IDomainMessage

          await this._handlerCallback(domainMessage)
        } catch (err) {
          this.emit('error', err)
          // do we throw it?
        } finally {
          if (consumerGroupOptions.autoCommit === false) {
            const isCommited = await new Promise<boolean>((resolve, reject): void => {
              this._consumerGroup.commit(function (err, data) {
                if (err != null) {
                  reject(err)
                }
                msgMetaData.commitResult = data
                resolve(true)
              })
            })

            if (isCommited) {
              this.emit('commit', msgMetaData)
            }
          }
          this._processing = false
        }
      }, 1)

      this._syncQueue.drain(() => {
        // do something here...
      })
    })
    // TODO need a timeout for this on-ready
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
    this._consumerGroup.close(false, () => {
    })
  }
}
