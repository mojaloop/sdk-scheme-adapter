/**
 * Created by Roman Pietrzak y@ke.mu on 2020-05-26.
 */
'use strict'

import { DomainEventMsg } from '@mojaloop/sdk-scheme-adapter-domain-lib'
import { MLTopics } from '../enums'
import { TransferRawPayload } from '../types'

export type TransferFulfilRequestedEvtPayload = {
  transferId: string
  payerId: string
  payeeId: string
  fulfilment: string
  completedTimestamp: string
  transferState: string
  fulfil: TransferRawPayload
}

export class TransferFulfilRequestedEvt extends DomainEventMsg {
  aggregateId: string
  aggregateName: string = 'Transfers'
  msgKey: string
  msgTopic: string = MLTopics.Events

  payload: TransferFulfilRequestedEvtPayload

  constructor (payload: TransferFulfilRequestedEvtPayload) {
    super()

    this.aggregateId = this.msgKey = payload.transferId

    this.payload = payload
  }

  validatePayload (): void { }
}
