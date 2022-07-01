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

import { IDomainMessage, ILogger, IMessageFetcher } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import * as RDKafka from 'node-rdkafka'
import { Assignment } from 'node-rdkafka'

export class RDKafkaFetcher implements IMessageFetcher {
  protected _logger: ILogger
  protected _kafkahost: string
  protected _groupId: string
  private readonly _env_name: string
  private readonly _commonClientConfs: RDKafka.ConsumerGlobalConfig

  constructor (kafkahost: string, groupId: string, logger: ILogger) {
    this._logger = logger
    this._kafkahost = kafkahost
    this._groupId = groupId

    this._commonClientConfs = {
      'metadata.broker.list': this._kafkahost,
      'group.id': this._groupId,
      'socket.keepalive.enable': true,
      'enable.auto.commit': false,
      'enable.auto.offset.store': false
    }
  }

  async init (): Promise<void> {
    // nothing to do here
    return await Promise.resolve()
  }

  async destroy (): Promise<void> {
    // nothing to do here
    return await Promise.resolve()
  }

  // get onl 1 message. either the one at the provided offset, or the last one if no offset is provided
  async fetchLast (aggregateId: string, topic: string, partition: number = -1, offset: number = 0): Promise<IDomainMessage | null> {
    const msgs = await this._fetcher(aggregateId, topic, partition, offset, true)
    return msgs.length > 0 ? msgs[0] : null
  }

  // get all messages. either starting at the provided offset, or from the beginning if no offset is provided
  async fetchAll (aggregateId: string, topic: string, partition: number = -1, firstOffset: number = 0): Promise<IDomainMessage[]> {
    return await this._fetcher(aggregateId, topic, partition, firstOffset, false)
  }

  async _fetcher (aggregateId: string, topic: string, partition: number, firstOffset: number, justOne: boolean): Promise<IDomainMessage[]> {
    // topic = 'ParticipantCommands'
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return await new Promise(async (resolve, reject) => {
      const retMsgs: IDomainMessage[] = []

      const consumer = new RDKafka.KafkaConsumer({
        ...this._commonClientConfs,
        'enable.partition.eof': true
      }, {
        'consume.callback.max.messages': 100,
        'auto.commit.enable': false
      })

      consumer.on('event.event', (err) => {
        this._logger.error(err)
      })

      consumer.on('event.stats', (err) => {
        this._logger.error(err)
      })

      consumer.on('event.error', (err) => {
        this._logger.error(err)
      })

      consumer.on('event.log', (evt: any) => {
        consumer.disconnect()
        return resolve(retMsgs)
      })

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      consumer.on('ready', async (readyInfo: RDKafka.ReadyInfo, metadata: RDKafka.Metadata) => {
        // get partitions if none was provided
        let partitions: number [] = []
        if (partition === -1) {
          // partitions = await this._getPartitionsForTopic(consumer.getClient(), topic)
          partitions = this._getPartitionsForTopicFromMetadata(metadata, topic)
        } else {
          partitions = [partition]
        }

        // OLDTODO check if this is EOF empty and return if it is - actually, the consume(number) sends empty array if EOF

        if (partitions.length > 0) {
          const assignments: Assignment[] = []
          partitions.forEach((p: number) => {
            assignments.push({
              topic: topic,
              partition: p,
              offset: firstOffset
            })
          })
          consumer.assign(assignments)
        } else {
          consumer.subscribe([topic])
        }

        let messageCounter = 0

        const consume = (): void => {
          consumer.consume(1, (err: RDKafka.LibrdKafkaError, messages: RDKafka.Message[]) => {
            if (err !== null) {
              this._logger.isErrorEnabled() && this._logger.error(err, 'RDKafkaFetcher error fetching messages from kafka')
              consumer.disconnect()
              return resolve([])
            }
            if (messages.length === 0) {
              this._logger.isDebugEnabled() && this._logger.debug('RDKafkaFetcher empty message set received (interpreting it as EOF), returning')
              consumer.disconnect()
              return resolve(retMsgs)
            }

            messages.forEach((message: RDKafka.Message) => {
              messageCounter++
              if (messageCounter % 100 === 0) {
                this._logger.isDebugEnabled() && this._logger.debug(`RDKafkaFetcher processed ${messageCounter} messages so far - current partition: ${message.partition} current offset: ${message.offset}`)
              }

              const msgKey: string | null = message.key != null ? message.key.toString() : null

              if (msgKey === null || msgKey !== aggregateId) {
                return consume()
              }

              const msgValue: string | null = message.value != null ? message.value.toString() : null
              if (msgValue == null) {
                return consume()
              }

              let msgAsDomainMessage: IDomainMessage | null = null
              try {
                msgAsDomainMessage = JSON.parse(msgValue) as IDomainMessage
                if (msgAsDomainMessage.msgPartition == null) {
                  msgAsDomainMessage.msgPartition = message.partition
                }
              } catch (err) {
                this._logger.isErrorEnabled() && this._logger.error('RDKafkaFetcher Error when JSON.parse()-ing message')
              }

              if (msgAsDomainMessage !== null) {
                retMsgs.push(msgAsDomainMessage)
              }
              if (justOne && retMsgs.length === 1) {
                // maybe the close will trigger the stream end
                consumer.disconnect()
                return resolve(retMsgs)
              } else {
                return consume()
              }
            })
          })
        }

        consume()
      })

      consumer.connect()
    })
  }

  async _getPartitionsForTopic (client: RDKafka.Client<string>, topic: string): Promise<number[]> {
    return await new Promise((resolve, reject) => {
      const partitions: number[] = []

      const opts = {
        topic: topic,
        timeout: 5000
      }

      client.getMetadata(opts, (err, metadata) => {
        if (err !== null) {
          this._logger.isErrorEnabled() && this._logger.error(err)
          return resolve(partitions)
        }

        const topicMeta = metadata.topics.find(t => t.name === topic)
        if (topicMeta === undefined) {
          this._logger.isWarnEnabled() && this._logger.warn('RDKafkaFetcher - couldn\'t get metadata/partitions for topic: ' + topic)
          return resolve(partitions)
        }

        topicMeta.partitions.forEach((partition: RDKafka.PartitionMetadata) => {
          partitions.push(partition.id)
        })

        resolve(partitions)
      })
    })
  }

  async _getTopicHighWatermarks (client: RDKafka.Client<string>, topic: string, partitions: number[]): Promise<Array<{ partition: number, empty: boolean }>> {
    const ret: Array<{ partition: number, empty: boolean }> = await Promise.all(
      partitions.map(async (partition: number) => {
        const watermarkOffsets = await this._getHighWatermarkForPartition(client, topic, partition)

        if (watermarkOffsets == null) {
          throw new Error(`Couldn't get watermarkOffsets for topic: ${topic} and partition: ${partition}`)
        }

        return {
          partition: partition,
          empty: (watermarkOffsets.highOffset - watermarkOffsets.lowOffset === 0)
        }
      })
    )

    return ret
  }

  async _getHighWatermarkForPartition (client: RDKafka.Client<string>, topic: string, partition: number): Promise<RDKafka.WatermarkOffsets | null> {
    return await new Promise<RDKafka.WatermarkOffsets | null>((resolve, reject) => {
      client.queryWatermarkOffsets(topic, partition, 1000, (err, offsets) => {
        if (err !== null) {
          this._logger.isErrorEnabled() && this._logger.error(err, 'RDKafkaFetcher - couldn\'t get metadata/partitions for topic: ' + topic)
          resolve(null)
        }
        resolve(offsets)
      })
    })
  }

  _getPartitionsForTopicFromMetadata (metadata: RDKafka.Metadata, topic: string): number[] {
    const partitions: number[] = []
    const topicMeta = metadata.topics.find(t => t.name === topic)
    if (topicMeta === undefined) {
      this._logger.isWarnEnabled() && this._logger.warn('RDKafkaFetcher - couldn\'t get metadata/partitions for topic: ' + topic)
      return partitions
    }

    topicMeta.partitions.forEach((partition: RDKafka.PartitionMetadata) => {
      partitions.push(partition.id)
    })

    return partitions
  }
}
