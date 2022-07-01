/**
 * Created by pedrosousabarreto@gmail.com on 22/May/2020.
 */

'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { TransfersTopics } from '../enums'

export class DuplicateTransferDetectedEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = TransfersTopics.DomainEvents

  payload: {
    id: string
  }

  constructor (transferId: string) {
    super()

    this.aggregateId = this.msgKey = transferId

    this.payload = {
      id: transferId
    }
  }

  validatePayload (): void { }
}
