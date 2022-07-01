/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-26.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { TransfersTopics } from '../enums'

export type TransferFulfilAcceptedEvtPayload = {
  transferId: string
  amount: string
  currency: string
  payerId: string
  payeeId: string
}

export class TransferFulfilAcceptedEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = TransfersTopics.DomainEvents

  payload: TransferFulfilAcceptedEvtPayload

  constructor (payload: TransferFulfilAcceptedEvtPayload) {
    super()

    this.aggregateId = this.msgKey = payload.transferId

    this.payload = payload
  }

  validatePayload (): void { }
}
