/**
 * Created by pedrosousabarreto@gmail.com on 28/May/2020.
 */

"use strict";


import {CreateTestCommand, UnrecognisedTestCommand, DuplicateTestDetectedEvent, TestCreatedEvent} from './domain/test_messages'
import {SimpleLogger} from './utilities/simple_logger'
import {TestAgg} from './domain/test_aggregate'
import {ILogger} from '../../src/ilogger'
import {MessageTypes} from '../../src/messages';
import {IMessagePublisher} from '../../src/imessage_publisher'
import {InMemoryTestEntityStateRepo} from './infrastructure/test_repo'
import {InMemMessagePublisher} from './infrastructure/in_mem_publisher';


const logger: ILogger = new SimpleLogger()
let repo: InMemoryTestEntityStateRepo
let inMemPublisher: IMessagePublisher
let testAgg: TestAgg

describe('libDomain entities', () => {

  beforeEach(async () => {
    repo = new InMemoryTestEntityStateRepo()
    await repo.init()

    inMemPublisher = new InMemMessagePublisher(logger)

    await inMemPublisher.init()

    testAgg = new TestAgg(repo, inMemPublisher, logger);
  })

  test('aggregrate will fail when trying to process a command when there\'s no registered handler', async () => {
    const unrecognisedCommand = new UnrecognisedTestCommand({
      id:' id',
      name: 'name'
    })

    await expect(testAgg.processCommand(unrecognisedCommand)).rejects.toThrow()
  })

  test('aggregrate will publish events raised during processing of command', async () => {
    const publishSpy = jest.spyOn(inMemPublisher, 'publish')
    const create_cmd = new CreateTestCommand({
      id: 'my_id',
      name: 'Test name 2'
    });

    await testAgg.processCommand(create_cmd)

    expect(publishSpy).toHaveBeenCalledTimes(1)
    expect(publishSpy.mock.calls[0][0]).toBeInstanceOf(TestCreatedEvent)
  })

  test('aggregrate will store the state after successfully processing command', async () => {
    const create_cmd = new CreateTestCommand({
      id: 'my_id',
      name: 'Test name 2'
    })
    expect(await repo.load('my_id')).toBe(null)

    await testAgg.processCommand(create_cmd)

    expect(await repo.load('my_id')).toMatchObject({ id: 'my_id', name: '', runCount: 0, version: 0 })
  })

  test('aggregrate does not store state if processing a command fails', async () => {
    const create_cmd = new CreateTestCommand({
      id: 'my_id',
      name: 'Test name 2'
    })
    await testAgg.processCommand(create_cmd)
    const storeSpy = jest.spyOn(repo, 'store')
    const publishSpy = jest.spyOn(inMemPublisher, 'publish')
    expect(storeSpy).not.toHaveBeenCalled()

    await testAgg.processCommand(create_cmd) // Duplicate will trigger command to fail

    expect(publishSpy).toHaveBeenCalledTimes(1)
    expect(publishSpy.mock.calls[0][0]).toBeInstanceOf(DuplicateTestDetectedEvent)
    expect(storeSpy).not.toHaveBeenCalled()
  })

  test('aggregrate will throw a not found error if entity is not in repo when throwNotFound is true', async () => {
    await expect(testAgg.load('1', true)).rejects.toThrow('Aggregate not found')
  })

  test('aggregrate will not throw a not found error if entity is not in repo when throwNotFound is false', async () => {
    await expect(testAgg.load('1', false)).resolves.toBe(undefined)  
  })

  test('can create command fromIDomainMessage', () => {
    const idm:CreateTestCommand =  CreateTestCommand.fromIDomainMessage({
      aggregateName:"aggregate_name",
      aggregateId: "aggregateId",
      msgName:"msg_name",
      msgPartition: null,
      msgOffset: null,
      msgId:"msgId",
      msgKey:"msgKey",
      msgTimestamp: 123,
      msgTopic:"msgTopic",
      msgType:MessageTypes.COMMAND,
      payload: {
        id: 'id',
        limit: 2,
        'name': 'name',
        'position': 100
      },
      traceInfo: null,
      addTraceInfo: (trace) => {},
      passTraceInfo: (message) => {}
    }) as CreateTestCommand

    const ret = idm.specialMethod()

    expect(ret).toBe('worked')
  })
})



