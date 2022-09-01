// NOTE: Where are the classes supposed to come from?
//       These tests seem to be imported from somewhere.

/*
import { KafkaMessagePublisher } from '../../../src/'
import { IMessage, MessageTypes } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'

describe.skip('Kafka Message Publisher', () => {

  let publisher: KafkaMessagePublisher

  beforeAll(() => {
    const kafkaGenericProducerOptions = {
      client: {
        kafka: {
          kafkaHost: 'localhost:9092',
          clientId: 'testCmdHandler'
        }
      }
    }
    publisher = new KafkaMessagePublisher(kafkaGenericProducerOptions);
  })

  test('sends a single message', async () => {
    const message: IMessage = {
      msgName: 'msgName',
      msgPartition: null,
      msgOffset: null,
      msgId: '123',
      msgKey: '321',
      msgTimestamp: 0,
      msgTopic: 'test',
      msgType: MessageTypes.COMMAND,
      payload: {},
      traceInfo: null,
      addTraceInfo: (trace) => {},
      passTraceInfo: (message) => {}
    };
    (publisher as any)._producer.send = jest.fn().mockResolvedValue(undefined)

    await publisher.publish(message)

    expect((publisher as any)._producer.send).toHaveBeenCalledWith(message)
  })

  test('sends an array of messages', async () => {
    const messages: IMessage[] = [
      {
        msgName: 'msgName',
        msgPartition: null,
        msgOffset: null,
        msgId: '123',
        msgKey: '321',
        msgTimestamp: 0,
        msgTopic: 'test',
        msgType: MessageTypes.COMMAND,
        payload: {},
        traceInfo: null,
        addTraceInfo: (trace) => {},
        passTraceInfo: (message) => {}
      },
      {
        msgName: 'msgName',
        msgPartition: null,
        msgOffset: null,
        msgId: '124',
        msgKey: '322',
        msgTimestamp: 1,
        msgTopic: 'test',
        msgType: MessageTypes.COMMAND,
        payload: {},
        traceInfo: null,
        addTraceInfo: (trace) => {},
        passTraceInfo: (message) => {}
      }
    ];
    (publisher as any)._producer.send = jest.fn().mockResolvedValue(undefined)

    await publisher.publishMany(messages)

    expect((publisher as any)._producer.send).toHaveBeenCalledWith(messages)
  })
})
*/
