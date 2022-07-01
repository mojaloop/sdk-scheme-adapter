/**
 * Created by pedrosousabarreto@gmail.com on 29/May/2020.
 */

"use strict";


import {TestEntityState} from "../domain/test_entity";
import {IEntityStateRepository} from "../../../src/ientity_state_repository";


export class InMemoryTestEntityStateRepo implements IEntityStateRepository<TestEntityState> {
  private readonly _list: Map<string, TestEntityState> = new Map<string, TestEntityState>()

  async init (): Promise<void> {
    return await Promise.resolve()
  }

  async destroy (): Promise<void> {
    return await Promise.resolve()
  }

  canCall (): boolean {
    return true
  }

  async load (id: string): Promise<TestEntityState|null> {
    return await new Promise((resolve, reject) => {
      if (!this._list.has(id)) { resolve(null) }

      resolve(this._list.get(id)!)
    })
  }

  async remove (id: string): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (!this._list.has(id)) { return reject(new Error('Not found')) } // maybe fail silently?

      this._list.delete(id)
      resolve()
    })
  }

  async store (entityState: TestEntityState): Promise<void> {
    return await new Promise((resolve, reject) => {
      this._list.set(entityState.id, entityState)
      resolve()
    })
  }
}
