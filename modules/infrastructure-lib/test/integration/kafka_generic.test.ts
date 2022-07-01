import { KafkaGenericProducer } from '../../src/kafka_generic_producer'
import { KafkaGenericConsumer, KafkaGenericConsumerOptions, EnumOffset } from '../../src/kafka_generic_consumer'
import { SimpleLogger } from '@mojaloop/sdk-scheme-adapter-domain-lib/test/unit/utilities/simple_logger'
import { IMessage, MessageTypes, IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'

describe('Kafka Generic Producer and Consumer', () => {
  const kafkaGenericProducerOptions = {
    client: {
      kafka: {
        kafkaHost: 'localhost:9092',
        clientId: 'testCmdHandler'
      }
    }
  }

  const kafkaMsgPublisher = new KafkaGenericProducer(
    kafkaGenericProducerOptions,
    new SimpleLogger()
  )

  beforeAll(async () => {
    await kafkaMsgPublisher.init()
  })

  afterAll(async () => {
    await kafkaMsgPublisher.destroy()
  })

  test('can produce and consume a message', async () => {    
    const message: IMessage = {
      msgId: '123',
      msgKey: '321',
      msgTimestamp: 0,
      msgTopic: 'test',
      msgType: MessageTypes.COMMAND,
      payload: {},
      traceInfo: null,
      addTraceInfo: (trace) => {},
      passTraceInfo: (message) => {}
    }
    const consumerOptions: KafkaGenericConsumerOptions = {
      client: {
        kafkaHost: 'localhost:9092',
        groupId: 'testCmdGroup',
        fromOffset: EnumOffset.LATEST
      },
      topics: ['test']
    }
    const consumer = await KafkaGenericConsumer.Create<KafkaGenericConsumerOptions>(consumerOptions, new SimpleLogger())
    
    await kafkaMsgPublisher.send(message)
    
    const result = await new Promise(resolve => {
      const handler = async (message: IDomainMessage) => {
        resolve(message)
      }
      consumer.init(handler)
    })

    await consumer.destroy(false)
    expect(result).toMatchObject({
      msgId: '123',
      msgKey: '321',
      msgTimestamp: 0,
      msgTopic: 'test',
      msgType: MessageTypes.COMMAND,
      payload: {}
    })
  })

  test('can produce an array of messages', async () => {
    const messages: IMessage[] = [
      {
        msgId: '123',
        msgKey: '321',
        msgTimestamp: 0,
        msgTopic: 'test2',
        msgType: MessageTypes.COMMAND,
        payload: {},
        traceInfo: null,
        addTraceInfo: (trace) => {},
        passTraceInfo: (message) => {}
      },
      {
        msgId: '124',
        msgKey: '322',
        msgTimestamp: 1,
        msgTopic: 'test2',
        msgType: MessageTypes.COMMAND,
        payload: {},
        traceInfo: null,
        addTraceInfo: (trace) => {},
        passTraceInfo: (message) => {}
      }
    ]
    const consumerOptions: KafkaGenericConsumerOptions = {
      client: {
        kafkaHost: 'localhost:9092',
        groupId: 'testCmdGroup2',
        fromOffset: EnumOffset.LATEST
      },
      topics: ['test2']
    }
    const consumer = await KafkaGenericConsumer.Create<KafkaGenericConsumerOptions>(consumerOptions, new SimpleLogger())
    
    await kafkaMsgPublisher.send(messages)
    
    const result: IDomainMessage[] = []
    const handler = async (message: IDomainMessage) => {
      result.push(message)
    }
    await consumer.init(handler)

    // wait for consumer
    await new Promise(resolve => {
      setTimeout(() => resolve(), 250)
    })

    await consumer.destroy(false)
    expect(result).toMatchObject([
      {
        msgId: '123',
        msgKey: '321',
        msgTimestamp: 0,
        msgTopic: 'test2',
        msgType: MessageTypes.COMMAND,
        payload: {}
      },
      {
        msgId: '124',
        msgKey: '322',
        msgTimestamp: 1,
        msgTopic: 'test2',
        msgType: MessageTypes.COMMAND,
        payload: {}
      }
    ])
  })

})