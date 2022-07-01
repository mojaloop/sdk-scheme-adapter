/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-28.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { TransfersTopics } from '../enums'
import { ParticipantEndpoint, TransferRawPayload } from '../types'

export type TransferFulfilledEvtPayload = {
  transferId: string
  amount: string
  currency: string
  payerId: string
  payeeId: string
  payerEndPoints: ParticipantEndpoint[]
  payeeEndPoints: ParticipantEndpoint[]
  fulfil: TransferRawPayload
}

export class TransferFulfilledEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = TransfersTopics.DomainEvents

  payload: TransferFulfilledEvtPayload

  constructor (payload: TransferFulfilledEvtPayload) {
    super()

    this.aggregateId = this.msgKey = payload.transferId

    this.payload = payload
  }

  validatePayload (): void { }
}
