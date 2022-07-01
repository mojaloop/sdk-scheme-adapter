/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */

"use strict";


import {IEntityFactory} from "../../../src/entity_factory";
import {TestEntity, TestEntityState} from "./test_entity";

export class TestEntityFactory implements IEntityFactory<TestEntity, TestEntityState> {
  // singleton
  private static _instance: TestEntityFactory
  static GetInstance (): TestEntityFactory {
    if (this._instance == null) { this._instance = new TestEntityFactory() }
    return this._instance
  }

  private constructor () {}

  create (): TestEntity {
    return TestEntity.CreateInstance(new TestEntityState())
  }

  createFromState (initialState: TestEntityState): TestEntity {
    return TestEntity.CreateInstance(initialState)
  }

  createWithId (initialId: string): TestEntity {
    const initialState: TestEntityState = new TestEntityState()
    initialState.id = initialId

    return TestEntity.CreateInstance(initialState)
  }
}



