/* eslint-disable @typescript-eslint/no-misused-promises */
/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Coil
 - Donovan Changfoot <donovan.changfoot@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * ModusBox
 - Miguel de Barros <miguel.debarros@modusbox.com>
 - Roman Pietrzak <roman.pietrzak@modusbox.com>

 --------------
******/

'use strict'

import { BaseEventSourcingAggregate, IMessagePublisher, ILogger, TCommandResult, IESourcingStateRepository, IEntityDuplicateRepository, StateSnapshotMsg } from '@mojaloop/sdk-scheme-adapter-public-types-lib'
import { ParticipantEntity, ParticipantState, InvalidAccountError, InvalidLimitError, NetDebitCapLimitExceededError, ParticipantEndpointState, ParticipantAccountState, ParticipantLimitState } from './participant_entity'
import { ParticipantsFactory } from './participants_factory'
import { ReservePayerFundsCmd } from '../messages/reserve_payer_funds_cmd'
import { CreateParticipantCmd } from '../messages/create_participant_cmd'
import { DuplicateParticipantDetectedEvt, InvalidParticipantEvt, PayerFundsReservedEvt, ParticipantCreatedEvt, NetCapLimitExceededEvt, PayeeFundsCommittedEvt, ParticipantAccountTypes, PayerFundsReservedEvtPayload, ParticipantEndpoint } from '@mojaloop/sdk-scheme-adapter-public-messages-lib'
import { IParticipantRepo } from './participant_repo'
import { CommitPayeeFundsCmd } from '../messages/commit_payee_funds_cmd'
import { ParticipantCreatedStateEvtPayload, ParticipantCreatedStateEvt } from '../messages/participant_created_stateevt'
import { ParticipantPositionChangedStateEvtPayload, ParticipantPositionChangedStateEvt } from '../messages/participant_position_changed_stateevt'
import { SnapshotParticipantStateCmd } from '../messages/snapshot_participant_state_cmd'
import { ParticipantStateSnapshotEvt } from '../messages/participant_state_snapshotevt'

export class ParticpantsAgg extends BaseEventSourcingAggregate<ParticipantEntity, ParticipantState> {
  /* eslint-disable-next-line @typescript-eslint/default-param-last */
  constructor (entityStateCacheRepo: IParticipantRepo, entityDuplicateRepo: IEntityDuplicateRepository | null = null, esStateRepo: IESourcingStateRepository, msgPublisher: IMessagePublisher, logger: ILogger) {
    super(ParticipantsFactory.GetInstance(), entityStateCacheRepo, entityDuplicateRepo, esStateRepo, msgPublisher, logger)

    // register command handlers
    this._registerCommandHandler('CreateParticipantCmd', this.processCreateParticipantCommand)
    this._registerCommandHandler('ReservePayerFundsCmd', this.processReserveFundsCommand)
    this._registerCommandHandler('CommitPayeeFundsCmd', this.processCommitFundsCommand)
    this._registerCommandHandler('SnapshotParticipantStateCmd', this.processParticipantStateSnapshotCommand)

    // register event handlers
    this._registerStateEventHandler('ParticipantCreatedStateEvt', this._applyCreatedStateEvent)
    this._registerStateEventHandler('ParticipantPositionChangedStateEvt', this._applyPositionChangedStateEvent)

    this._setSnapshotHandler(this._applySnapshotHandler)
  }

  // async loadAllToInMemoryCache (): Promise<void> {
  //   return await new Promise(async (resolve, reject) => {
  //     const allIds: string[] = await this._entityDuplicateRepo.getAll()
  //     // const allIds: string[] = await this.getAll()
  //     await Promise.all(allIds.map(async (id: string) => {
  //       await this.load(id)
  //     })).then(async () => {
  //       return resolve()
  //     })
  //   })
  // }

  async processCreateParticipantCommand (commandMsg: CreateParticipantCmd): Promise<TCommandResult> {
    // try loading first to detect duplicates
    // check for duplicates
    // const duplicate: boolean = await this._entityDuplicateRepo.exists(commandMsg.payload?.participant?.id)
    await this.load(commandMsg.payload?.participant?.id, false)

    if (this._rootEntity != null) {
    // if (duplicate) {
      const duplicateParticipantDetectedEvtPayload = {
        participantId: commandMsg.payload?.participant?.id
      }
      this.recordDomainEvent(new DuplicateParticipantDetectedEvt(duplicateParticipantDetectedEvtPayload))
      return { success: false, stateEvent: null }
    }

    this.create(commandMsg.payload?.participant?.id)

    // const initialState = Object.assign({}, new ParticipantState(), commandMsg.payload.participant)

    const participantEndpointStateList: ParticipantEndpointState[] = commandMsg.payload.participant.endpoints.map(endpoint => {
      const participantEndpointState: ParticipantEndpointState = new ParticipantEndpointState()
      participantEndpointState.type = endpoint.type
      participantEndpointState.value = endpoint.value
      return participantEndpointState
    })

    const participantAccountStateList: ParticipantAccountState[] = commandMsg.payload.participant.accounts.map(account => {
      const participantAccountState = new ParticipantAccountState()
      participantAccountState.type = account.type
      participantAccountState.currency = account.currency
      participantAccountState.position = account.position
      participantAccountState.initialPosition = account.initialPosition
      participantAccountState.limits = account.limits.map(endpoint => {
        const participantLimitState = new ParticipantLimitState()
        participantLimitState.type = endpoint.type
        participantLimitState.value = endpoint.value
        return participantLimitState
      })
      return participantAccountState
    })

    const participantState: ParticipantState = new ParticipantState()
    participantState.id = commandMsg.payload.participant.id
    participantState.name = commandMsg.payload.participant.name
    participantState.accounts = participantAccountStateList
    participantState.endpoints = participantEndpointStateList
    participantState.partition = commandMsg.payload.participant.partition
    this._rootEntity = new ParticipantEntity(participantState)

    const participantCreatedEvtPayload = {
      participant: {
        id: participantState.id,
        name: participantState.name
      }
    }
    this.recordDomainEvent(new ParticipantCreatedEvt(participantCreatedEvtPayload))

    // state event
    const stateEvtPayload: ParticipantCreatedStateEvtPayload = {
      participant: {
        id: this._rootEntity.id,
        name: this._rootEntity.name,
        accounts: this._rootEntity.accounts,
        endpoints: this._rootEntity.endpoints,
        partition: this._rootEntity.partition
      }
    }
    const stateEvt: ParticipantCreatedStateEvt = new ParticipantCreatedStateEvt(stateEvtPayload)

    // update duplicate
    // const success: boolean = await this._entityDuplicateRepo.add(commandMsg.payload?.participant?.id)
    // if (!success) {
    //   throw new Error('ParticpantsAgg.processCreateParticipantCommand unable to update duplicate repository')
    // }
    return { success: true, stateEvent: stateEvt }
  }

  private async _applyCreatedStateEvent (stateEvent: ParticipantCreatedStateEvt, replayed?: boolean): Promise<void> {
    const state: ParticipantState = {
      ...stateEvent.payload.participant,
      created_at: stateEvent.msgTimestamp,
      updated_at: stateEvent.msgTimestamp,
      version: 0 // fixed for now?!?!
    }

    this._rootEntity = this._entity_factory.createFromState(state)
  }

  private async _applyPositionChangedStateEvent (stateEvent: ParticipantPositionChangedStateEvt, replayed?: boolean): Promise<void> {
    if (this._rootEntity === null) {
      throw new Error('Null root entity found while trying to apply "ParticipantPositionChangedStateEvt"')
    }

    let positionChangedOk: boolean = false
    const state: ParticipantState = this._rootEntity.exportState()
    state.accounts.forEach((account: ParticipantAccountState) => {
      if (account.type === ParticipantAccountTypes.POSITION && account.currency === stateEvent.payload.participant.currency) {
        account.position = stateEvent.payload.participant.currentPosition
        positionChangedOk = true
      }
    })

    if (!positionChangedOk) {
      throw new Error('Couldn\'t find correct account to update position while trying to apply "ParticipantPositionChangedStateEvt"')
    }

    // replace the state
    this._rootEntity = this._entity_factory.createFromState(state)
  }

  async processReserveFundsCommand (commandMsg: ReservePayerFundsCmd): Promise<TCommandResult> {
    await this.load(commandMsg.payload.payerId, false)

    // # Validate PayerFSP exists
    if (this._rootEntity == null) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payerId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    // TODO evaluate a new way of doing this - maybe send a cmd to veryfy the payee before the reserveCmd - then when verified the participantEventHandler can send the reserve cmd

    // # Fetch Payee FSP so that we can validate the accounts, and retrieve endpoints
    const payeeFspState = await (this._entity_cache_repo as IParticipantRepo).load(commandMsg.payload.payeeId)

    if (payeeFspState == null) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payeeId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    const payeeFspEntity = new ParticipantEntity(payeeFspState)
    // # Validate PayeeFSP account
    const payeeHasAccount: boolean = payeeFspEntity.hasAccount(ParticipantAccountTypes.POSITION, commandMsg.payload.currency)
    if (!payeeHasAccount) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payeeId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    // # Lets try reserve funds
    try {
      // # Validate PayerFSP Account+Limit, and Reserve-Funds against position if NET_DEBIG_CAP limit has not been exceeded
      this._rootEntity.reserveFunds(commandMsg.payload.currency, commandMsg.payload.amount)
      const currentPosition = this._rootEntity.getCurrentPosition(commandMsg.payload.currency)

      const payerEndPoints: ParticipantEndpoint[] = this._rootEntity?.endpoints?.map(endPoint => {
        return {
          type: endPoint.type,
          value: endPoint.value
        }
      })

      const payeeEndPoints: ParticipantEndpoint[] = payeeFspEntity?.endpoints?.map(endPoint => {
        return {
          type: endPoint.type,
          value: endPoint.value
        }
      })

      const payerFundsReservedEvtPayload: PayerFundsReservedEvtPayload = {
        transferId: commandMsg.payload.transferId,
        payerId: commandMsg.payload.payerId,
        currency: commandMsg.payload.currency,
        currentPosition: currentPosition,
        payerEndPoints,
        payeeEndPoints
      }
      this.recordDomainEvent(new PayerFundsReservedEvt(payerFundsReservedEvtPayload))

      // state event
      const stateEvtPayload: ParticipantPositionChangedStateEvtPayload = {
        participant: {
          id: this._rootEntity.id,
          currency: commandMsg.payload.currency,
          currentPosition: currentPosition,
          partition: this._rootEntity.partition
        }
      }
      const stateEvt: ParticipantPositionChangedStateEvt = new ParticipantPositionChangedStateEvt(stateEvtPayload)

      return { success: true, stateEvent: stateEvt }
    } catch (err: any) {
      switch (err.constructor) {
        case InvalidAccountError:
        case InvalidLimitError: {
          this.recordInvalidParticipantEvt(commandMsg.payload.payerId, commandMsg.payload.transferId, err)
          break
        }
        case NetDebitCapLimitExceededError: {
          const netCapLimitExceededEvtPayload = {
            transferId: commandMsg.payload.transferId,
            payerId: commandMsg.payload.payerId,
            reason: err.message
          }
          this.recordDomainEvent(new NetCapLimitExceededEvt(netCapLimitExceededEvtPayload))
          break
        }
        default: {
          throw err
        }
      }
    }
    return { success: false, stateEvent: null }
  }

  async processCommitFundsCommand (commandMsg: CommitPayeeFundsCmd): Promise<TCommandResult> {
    await this.load(commandMsg.payload.payeeId, false)

    // # Validate PayeeFSP exists
    if (this._rootEntity == null) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payeeId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    // # Validate PayeeFSP account - commenting this out since we validate the PayerFSP account as part of the reseverFunds
    const payeeHasAccount: boolean = this._rootEntity.hasAccount(ParticipantAccountTypes.POSITION, commandMsg.payload.currency)
    if (!payeeHasAccount) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payeeId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    // # Fetch Payer FSP so that we can validate the accounts, and retrieve endpoints
    const payerFspState = await (this._entity_cache_repo as IParticipantRepo).load(commandMsg.payload.payerId)

    if (payerFspState == null) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payerId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    const payerFspEntity = new ParticipantEntity(payerFspState)
    // # Validate PayeeFSP account
    const payerHasAccount: boolean = payerFspEntity.hasAccount(ParticipantAccountTypes.POSITION, commandMsg.payload.currency)
    if (!payerHasAccount) {
      this.recordInvalidParticipantEvt(commandMsg.payload.payeeId, commandMsg.payload.transferId)
      return { success: false, stateEvent: null }
    }

    // # Lets try commit funds
    // # TODO: Should we also include checks that this commit is in a response to a reserve?
    try {
      // # Validate PayerFSP Account+Limit, and Reserve-Funds against position if NET_DEBIG_CAP limit has not been exceeded
      this._rootEntity.commitFunds(commandMsg.payload.currency, commandMsg.payload.amount)
      const currentPosition = this._rootEntity.getCurrentPosition(commandMsg.payload.currency)

      const payerEndPoints: ParticipantEndpoint[] = payerFspEntity?.endpoints?.map(endPoint => {
        return {
          type: endPoint.type,
          value: endPoint.value
        }
      })

      const payeeEndPoints: ParticipantEndpoint[] = this._rootEntity?.endpoints?.map(endPoint => {
        return {
          type: endPoint.type,
          value: endPoint.value
        }
      })

      const payeeFundsCommittedEvtPayload = {
        transferId: commandMsg.payload.transferId,
        payerId: commandMsg.payload.payerId,
        payeeId: commandMsg.payload.payeeId,
        currency: commandMsg.payload.currency,
        currentPosition: currentPosition,
        payerEndPoints,
        payeeEndPoints
      }
      this.recordDomainEvent(new PayeeFundsCommittedEvt(payeeFundsCommittedEvtPayload))

      // state event
      const stateEvtPayload: ParticipantPositionChangedStateEvtPayload = {
        participant: {
          id: this._rootEntity.id,
          currency: commandMsg.payload.currency,
          currentPosition: currentPosition,
          partition: this._rootEntity.partition
        }
      }
      const stateEvt: ParticipantPositionChangedStateEvt = new ParticipantPositionChangedStateEvt(stateEvtPayload)

      return { success: true, stateEvent: stateEvt }
    } catch (err: any) {
      switch (err.constructor) {
        case InvalidAccountError:
        case InvalidLimitError: {
          this.recordInvalidParticipantEvt(commandMsg.payload.payerId, commandMsg.payload.transferId, err)
          break
        }
        default: {
          throw err
        }
      }
    }
    return { success: false, stateEvent: null }
  }

  async processParticipantStateSnapshotCommand (commandMsg: SnapshotParticipantStateCmd): Promise<TCommandResult> {
    await this.load(commandMsg.payload.participantId, false) // we'll throw the next line with a proper error

    if (this._rootEntity == null) {
      const err = new Error(`Could not load participant with id '${commandMsg.payload.participantId}' to process snapshot command`)
      throw err
    }

    const snapshot = new ParticipantStateSnapshotEvt(this._rootEntity.exportState())

    return { success: true, stateEvent: snapshot }
  }

  private async _applySnapshotHandler (snapshotEvent: StateSnapshotMsg, replayed?: boolean): Promise<void> {
    const state: ParticipantState = snapshotEvent.payload as ParticipantState
    if (state === null || state === undefined || state.id === undefined) {
      throw new Error('Invalid participant state in ParticipantStateSnapshotEvt, cannot be applied')
    }
    this._rootEntity = this._entity_factory.createFromState(state)
  }

  private recordInvalidParticipantEvt (participantId: string, transferId: string, err?: Error): void {
    const InvalidParticipantEvtPayload = {
      participantId,
      transferId: transferId,
      reason: err?.message
    }
    this.recordDomainEvent(new InvalidParticipantEvt(InvalidParticipantEvtPayload))
  }
}
