/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */

"use strict";

import {CommandMsg, DomainEventMsg} from "../../../src/messages";

export type TestCommandPayload = {
  id: string
  name: string
}

export class UnrecognisedTestCommand extends CommandMsg {
  aggregateName: string = 'Test'
  msgTopic: string = 'TestTopic'

  aggregateId!: string;
  msgKey!: string

  payload!: TestCommandPayload

  constructor (payload:TestCommandPayload){
    super()

    if(!payload)
      return

    this.payload = payload

    this.aggregateId = this.msgKey = this.payload.id
  }

  validatePayload():void{

  }
}

export class CreateTestCommand extends CommandMsg {
  aggregateName: string = 'Test'
  msgTopic: string = 'TestTopic'

  aggregateId!: string;
  msgKey!: string

  payload!: TestCommandPayload

  constructor (payload:TestCommandPayload){
    super()

    if(!payload)
      return

    this.payload = payload

    this.aggregateId = this.msgKey = this.payload.id
  }

  validatePayload():void{

  }

  specialMethod():string{
    return 'worked'
  }
}



export class TestCreatedEvent extends DomainEventMsg{
  aggregateId: string
  aggregateName: string = 'Tests'
  msgKey: string
  msgTopic: string = 'test'
  payload: { [k: string]: any }

  constructor (testId: string) {
    super()

    this.aggregateId = this.msgKey = testId

    this.payload = {
      id: testId
    }
  }

  validatePayload():void{ }
}



export class DuplicateTestDetectedEvent extends DomainEventMsg{
  aggregateId: string
  aggregateName: string = 'Tests'
  msgKey: string
  msgTopic: string = 'test'
  payload: { [k: string]: any }

  constructor (testId: string) {
    super()

    this.aggregateId = this.msgKey = testId

    this.payload = {
      id: testId
    }
  }

  validatePayload():void{ }
}
