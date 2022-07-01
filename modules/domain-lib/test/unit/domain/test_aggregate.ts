/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */

"use strict";

import {BaseAggregate} from "../../../src/base_aggregate";
import {IEntityStateRepository} from "../../../src/ientity_state_repository";
import {IMessagePublisher} from "../../../src/imessage_publisher";
import {ILogger} from "../../../src/ilogger";
import {TestEntity, TestEntityState} from "./test_entity";
import {TestEntityFactory} from "./test_factory";
import {CreateTestCommand, DuplicateTestDetectedEvent, TestCreatedEvent} from "./test_messages";
import { CommandMsg } from "../../../src/messages";

export class TestAgg extends BaseAggregate<TestEntity, TestEntityState> {
  constructor (entityStateRepo: IEntityStateRepository<TestEntityState>, msgPublisher: IMessagePublisher, logger: ILogger) {
    super(TestEntityFactory.GetInstance(), entityStateRepo, msgPublisher, logger)
    this._registerCommandHandler('CreateTestCommand', this.processCreateTestCommandCommand)

  }

  protected async processCreateTestCommandCommand (commandMsg: CommandMsg): Promise<boolean> {
    // try loadling first to detect duplicates
    await this.load(commandMsg.payload.id, false)
    if (this._rootEntity != null) {
      this.recordDomainEvent(new DuplicateTestDetectedEvent(commandMsg.payload.id))
      return false
    }

    this.create(commandMsg.payload.id)


    this.recordDomainEvent(new TestCreatedEvent(this._rootEntity!.id))

    return true
  }

  async load (id: string, throwNotFound: boolean): Promise<void> {
    await super.load(id, throwNotFound)
  }

}

