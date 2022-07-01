/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-26.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MLTopics } from '../enums'
import { TransferRawPayload } from '../types'

export type TransferPrepareRequestedEvtPayload = {
  transferId: string
  amount: string
  currency: string
  payerId: string
  payeeId: string
  expiration: string
  condition: string
  prepare: TransferRawPayload
}

export class TransferPrepareRequestedEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = MLTopics.Events

  payload: TransferPrepareRequestedEvtPayload

  constructor (payload: TransferPrepareRequestedEvtPayload) {
    super()

    this.aggregateId = this.msgKey = payload.transferId

    this.payload = payload
  }

  validatePayload (): void { }
}
