import { KafkaJsConsumerOptions, KafkaJsConsumer } from '../../src/kafkajs_consumer'
import { KafkaJsProducerOptions, KafkajsProducer } from '../../src/kafkajs_producer'
import { SimpleLogger } from '@mojaloop/sdk-scheme-adapter-domain-lib/test/unit/utilities/simple_logger'
import { IMessage, MessageTypes, IDomainMessage } from '@mojaloop/sdk-scheme-adapter-domain-lib'

describe('Kafkajs Consumer and Publisher', () => {
  const kafkajsPublisherConfig: KafkaJsProducerOptions = {
    client: {
      client: {
        brokers: ['localhost:9092'],
        clientId: 'testkafkajsProducer'
      },
      producer: {
        allowAutoTopicCreation: true,
        idempotent: true,
        transactionTimeout: 30000
      }
    }
  }
  const publisher = new KafkajsProducer(kafkajsPublisherConfig, new SimpleLogger())

  beforeAll(async () => {
    await publisher.init()
  })

  afterAll(async () => {
    await publisher.destroy()
  })

  test('can produce and consume a single message', async () => {
    const consumeOptions: KafkaJsConsumerOptions = {
      client: {
        client: {
          brokers: ['localhost:9092'],
          clientId: 'testKafajsConsumer1'
        },
        consumer: {
          groupId: 'kafkajstest1'
        }
      },
      topics: ['kafkajstest1']
    }
    const consumer = new KafkaJsConsumer(consumeOptions, new SimpleLogger())
    const message: IMessage = {
      msgId: '123',
      msgKey: '321',
      msgTimestamp: 0,
      msgTopic: 'kafkajstest1',
      msgType: MessageTypes.COMMAND,
      payload: {},
      traceInfo: null,
      addTraceInfo: (trace) => {},
      passTraceInfo: (message) => {}
    }
    
    await publisher.send(message)

    const result = await new Promise(resolve => {
      const handler = async (message: IDomainMessage) => {
        resolve(message)
      }
      consumer.init(handler)
    })

    await consumer.destroy()
    expect(result).toMatchObject({
      msgId: '123',
      msgKey: '321',
      msgTimestamp: 0,
      msgTopic: 'kafkajstest1',
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
        msgTopic: 'kafkajstest2',
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
        msgTopic: 'kafkajstest2',
        msgType: MessageTypes.COMMAND,
        payload: {},
        traceInfo: null,
        addTraceInfo: (trace) => {},
        passTraceInfo: (message) => {}
      }
    ]
    const consumeOptions: KafkaJsConsumerOptions = {
      client: {
        client: {
          brokers: ['localhost:9092'],
          clientId: 'testKafajsConsumer2'
        },
        consumer: {
          groupId: 'kafkajstest2'
        }
      },
      topics: ['kafkajstest2']
    }
    const consumer = new KafkaJsConsumer(consumeOptions, new SimpleLogger())
    
    await publisher.send(messages)
    
    const result: IDomainMessage[] = []
    const handler = async (message: IDomainMessage) => {
      result.push(message)
    }
    await consumer.init(handler)

    // wait for consumer
    await new Promise(resolve => {
      setTimeout(() => resolve(), 250)
    })

    await consumer.destroy()
    expect(result).toMatchObject([
      {
        msgId: '123',
        msgKey: '321',
        msgTimestamp: 0,
        msgTopic: 'kafkajstest2',
        msgType: MessageTypes.COMMAND,
        payload: {}
      },
      {
        msgId: '124',
        msgKey: '322',
        msgTimestamp: 1,
        msgTopic: 'kafkajstest2',
        msgType: MessageTypes.COMMAND,
        payload: {}
      }
    ])
  }, 10000)
})