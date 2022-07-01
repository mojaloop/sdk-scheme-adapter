/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-28.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { TransfersTopics } from '../enums'

export class TransferNotFoundEvt extends DomainEventMsg {
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
