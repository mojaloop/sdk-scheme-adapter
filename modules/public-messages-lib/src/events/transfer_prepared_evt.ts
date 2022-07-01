/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-28.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { TransfersTopics } from '../enums'
import { ParticipantEndpoint, TransferRawPayload } from '../types'

export type TransferPreparedEvtPayload = {
  transferId: string
  amount: string
  currency: string
  payerId: string
  payeeId: string
  payerEndPoints: ParticipantEndpoint[]
  payeeEndPoints: ParticipantEndpoint[]
  prepare: TransferRawPayload
}

export class TransferPreparedEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = TransfersTopics.DomainEvents

  payload: TransferPreparedEvtPayload

  constructor (payload: TransferPreparedEvtPayload) {
    super()

    this.aggregateId = this.msgKey = payload.transferId

    this.payload = payload
  }

  validatePayload (): void { }
}
