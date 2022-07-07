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
 * Modusbox
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict'
// import { v4 as uuidv4 } from 'uuid'
// import {InMemoryTransferStateRepo} from "../infrastructure/inmemory_transfer_repo";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { IRunHandler, KafkaDomainEventsConsumer } from '@mojaloop/sdk-scheme-adapter-infra-lib'
import { IEventsConsumer, DomainEventMessage, OutboundDomainEventMessageName } from '@mojaloop/sdk-scheme-adapter-private-types-lib';
import { SDKOutboundBulkRequestReceivedMessage } from '@mojaloop/sdk-scheme-adapter-private-types-lib';

// import { InvalidOutboundEvtError } from './errors'
import { Crypto } from '@mojaloop/sdk-scheme-adapter-utilities-lib'
// import { TransferPreparedStateEvt, TransferPreparedStateEvtPayload } from '../messages/transfer_prepared_stateevt'
// import { TransferFulfiledStateEvt, TransferFulfiledStateEvtPayload } from '../messages/transfer_fulfiled_stateevt'
// import { TransferStateChangedStateEvt, TransferStateChangedStateEvtPayload } from '../messages/transfer_state_changed_stateevt'
// import { TransferInternalStates } from '../domain/transfer_entity'

export class OutboundEventHandler implements IRunHandler {
  private _logger: ILogger
  private _consumer: IEventsConsumer
  private _clientId: string
  // private _readSideRepo: MongoDbReadsideTransferRepo
  private _histooutboundEvtHandlerMetric: any
  private _histoTransferStateStoreTimeMetric: any

  async start (appConfig: any, logger: ILogger): Promise<void> {
    this._logger = logger
    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler::start - appConfig=${JSON.stringify(appConfig)}`)
    this._clientId = `outboundEvtHandler-${appConfig.kafka.consumer as string}-${Crypto.randomBytes(8)}`

    // this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - Creating repo of type ${MongoDbReadsideTransferRepo.constructor.name}`)
    // this._readSideRepo = new MongoDbReadsideTransferRepo(appConfig.readside_store.uri, logger)
    // await this._readSideRepo.init()

    // this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - Created repo of type ${this._readSideRepo.constructor.name}`)

    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - Creating ${appConfig.kafka.consumer as string}...`)

    this._consumer = new KafkaDomainEventsConsumer(this._messageHandler.bind(this), logger)

    logger.isInfoEnabled() && logger.info(`outboundEvtHandler - Created kafkaConsumer of type ${this._consumer.constructor.name}`)

    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    await this._consumer.init() // we're interested in all stateEvents
    await this._consumer.start()
  }

  async destroy (): Promise<void> {
    await this._consumer.destroy()
    // await this._readSideRepo.destroy()
  }

  async _messageHandler (message: DomainEventMessage): Promise<void> {
    this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - ${message.getName()}`)
    console.log(message)
    switch (message.getName()) {
      case OutboundDomainEventMessageName.SDKOutboundBulkRequestReceived: {
        // TODO: Change the static function names to start with capital
        const sdkOutboundBulkRequestReceivedMessage = SDKOutboundBulkRequestReceivedMessage.createFromDomainEventMessage(message)
        console.log(sdkOutboundBulkRequestReceivedMessage.getBulkTransactionEntity())
        // TODO: Construct and publish the command message
        break;
      }
      default: {
        this._logger.isDebugEnabled() && this._logger.debug(`outboundEvtHandler - ${message?.getName()}:${message?.getKey()} - Skipping unknown outbound domain event`);
        return;
      }
    }
    // try {
    //   this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - persisting state event event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Start`)

      // switch (message.msgName) {
      //   case TransferPreparedStateEvt.name: {
      //     const evt = TransferPreparedStateEvt.fromIDomainMessage(message)
      //     if (evt == null) throw new InvalidTransferEvtError(`TransferPreparedStateEvt is unable to persist state event - ${message.msgName} is Invalid - ${message?.msgName}:${message?.msgKey}:${message?.msgId}`)
      //     await this._handleTransferPreparedStateEvt(evt)
      //     break
      //   }
      //   case TransferFulfiledStateEvt.name: {
      //     const evt = TransferFulfiledStateEvt.fromIDomainMessage(message)
      //     if (evt == null) throw new InvalidTransferEvtError(`TransferFulfiledStateEvt is unable to persist state event - ${message.msgName} is Invalid - ${message?.msgName}:${message?.msgKey}:${message?.msgId}`)
      //     await this._handleTransferFulfiledStateEvt(evt)
      //     break
      //   }
      //   case TransferStateChangedStateEvt.name: {
      //     const evt = TransferStateChangedStateEvt.fromIDomainMessage(message)
      //     if (evt == null) throw new InvalidTransferEvtError(`TransferStateChangedStateEvt is unable to persist state event - ${message.msgName} is Invalid - ${message?.msgName}:${message?.msgKey}:${message?.msgId}`)
      //     await this._handleTransferStateChangedStateEvt(evt)
      //     break
      //   }
      //   default: {
      //     this._logger.isDebugEnabled() && this._logger.debug(`outboundEvtHandler - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Skipping unknown event`)
      //     histTimer({ success: 'true', evtname })
      //     return
      //   }
      // }

    //   this._logger.isInfoEnabled() && this._logger.info(`outboundEvtHandler - persisted state event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Result: true`)
    // } catch (err: any) {
    //   this._logger.isErrorEnabled() && this._logger.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    //   const errMsg: string = err?.message?.toString()
    //   this._logger.isWarnEnabled() && this._logger.warn(`outboundEvtHandler - persisting state event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${errMsg}`)
    // }
  }

  // private async _handleTransferPreparedStateEvt (evt: TransferPreparedStateEvt): Promise<void> {
  //   const payload: TransferPreparedStateEvtPayload = evt.payload

  //   // we don't care if one exists already, the read side has no logic and asks no questions

  //   const success: boolean = await this._readSideRepo.insertTransferState({
  //     id: payload.transfer.id,
  //     created_at: evt.msgTimestamp,
  //     updated_at: evt.msgTimestamp,
  //     version: 1, // NOTE we're not doing versions yet

  //     amount: payload.transfer.amount,
  //     currency: payload.transfer.currency,
  //     transferInternalState: TransferInternalStates.RECEIVED_PREPARE,
  //     payerId: payload.transfer.payerId,
  //     payeeId: payload.transfer.payeeId,
  //     expiration: payload.transfer.expiration,
  //     condition: payload.transfer.condition,
  //     prepare: payload.transfer.prepare,
  //     fulfilment: payload.transfer.fulfilment,
  //     completedTimestamp: '',
  //     fulfil: payload.transfer.fulfil,
  //     reject: payload.transfer.reject
  //   })

  //   if (!success) {
  //     throw new InvalidTransferEvtError(`_handleTransferPreparedStateEvt is unable to persist state event - Transfer '${evt.msgKey}' is Invalid - ${evt.msgName}:${evt.msgKey}:${evt.msgId}`)
  //   }
  // }

  // private async _handleTransferFulfiledStateEvt (evt: TransferFulfiledStateEvt): Promise<void> {
  //   const payload: TransferFulfiledStateEvtPayload = evt.payload

  //   // we don't care if one exists already, the read side has no logic and asks no questions
  //   const success: boolean = await this._readSideRepo.updateFulfil({
  //     transfer: {
  //       id: payload.transfer.id,
  //       fulfilment: payload.transfer.fulfilment,
  //       completedTimestamp: payload.transfer.completedTimestamp,
  //       fulfil: payload.transfer.fulfil,
  //       transferInternalState: TransferInternalStates.RECEIVED_FULFIL
  //     }
  //   })

  //   if (!success) {
  //     throw new InvalidTransferEvtError(`_handleTransferFulfiledStateEvt is unable to persist state event - Transfer '${evt.msgKey}' is Invalid - ${evt.msgName}:${evt.msgKey}:${evt.msgId}`)
  //   }
  // }

  // private async _handleTransferStateChangedStateEvt (evt: TransferStateChangedStateEvt): Promise<void> {
  //   const payload: TransferStateChangedStateEvtPayload = evt.payload

  //   // we don't care if one exists already, the read side has no logic and asks no questions
  //   const success: boolean = await this._readSideRepo.updateState(payload)

  //   if (!success) {
  //     throw new InvalidTransferEvtError(`_handleTransferStateChangedStateEvt is unable to persist state event - Transfer '${evt.msgKey}' is Invalid - ${evt.msgName}:${evt.msgKey}:${evt.msgId}`)
  //   }
  // }
}
