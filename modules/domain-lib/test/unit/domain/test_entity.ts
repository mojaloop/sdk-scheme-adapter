/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */
"use strict";


import {BaseEntityState} from "../../../src/base_entity_state";
import {BaseEntity} from "../../../src/base_entity";

export class TestEntityState extends BaseEntityState{
  name: string = ""
  runCount: number = 0
  version: number = 0
}

export class TestEntity extends BaseEntity<TestEntityState>{
  get name():string{
    return this._state.name
  }

  get runCount():number{
    return this._state.runCount
  }

  get version():number{
    return this._state.version
  }

  static CreateInstance (initialState?: TestEntityState): TestEntity {
    initialState = initialState ?? new TestEntityState()
    const entity: TestEntity = new TestEntity(initialState)
    return entity
  }

  rename(newName:string):void{
    this._state.name = newName
    this._state.version ++
  }

  run():void{
    // nothing
    this._state.runCount++;
  }
}
