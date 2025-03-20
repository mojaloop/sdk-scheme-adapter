/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>
 * Infitx

 - Sridevi Miriyala <sridevi.miriyala@modusbox.com>
 - Kevin Leyow <kevin.leyow@infitx.com>
 - Miguel de Barros <miguel.debarros@modusbox.com>
 --------------
 ******/

"use strict";

import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SDKSchemeAdapter } from "@mojaloop/api-snippets";

import {
    BulkBatchState,
    // BulkTransactionInternalState,
    DomainEvent,
    IBulkTransactionEntityRepo,
    ICommandEventProducer,
    IDomainEventProducer,
    IEventConsumer,
    // IEventProducer,
    IKafkaEventConsumerOptions,
    IKafkaEventProducerOptions,
    IPrepareSDKOutboundBulkResponseCmdEvtData,
    IProcessBulkQuotesCallbackCmdEvtData,
    IProcessBulkTransfersCallbackCmdEvtData,
    IProcessPartyInfoCallbackCmdEvtData,
    IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData,
    IProcessSDKOutboundBulkAcceptQuoteCmdEvtData,
    IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
    IProcessSDKOutboundBulkQuotesRequestCmdEvtData,
    IProcessSDKOutboundBulkRequestCmdEvtData,
    IProcessSDKOutboundBulkResponseSentCmdEvtData,
    IProcessSDKOutboundBulkTransfersRequestCmdEvtData,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
    PrepareSDKOutboundBulkResponseCmdEvt,
    ProcessBulkQuotesCallbackCmdEvt,
    ProcessBulkTransfersCallbackCmdEvt,
    ProcessPartyInfoCallbackCmdEvt,
    ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt,
    ProcessSDKOutboundBulkAcceptQuoteCmdEvt,
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
    ProcessSDKOutboundBulkQuotesRequestCmdEvt,
    ProcessSDKOutboundBulkRequestCmdEvt,
    ProcessSDKOutboundBulkResponseSentCmdEvt,
    ProcessSDKOutboundBulkTransfersRequestCmdEvt,
    RedisBulkTransactionStateRepo,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { randomUUID } from "crypto";
import { Timer } from "./timer";

export enum StopAfterEventEnum {
  ProcessSDKOutboundBulkRequestCmdEvt = 'ProcessSDKOutboundBulkRequestCmdEvt',
  ProcessSDKOutboundBulkPartyInfoRequestCmdEvt = 'ProcessSDKOutboundBulkPartyInfoRequestCmdEvt',
  ProcessPartyInfoCallbackCmdEvt = 'ProcessPartyInfoCallbackCmdEvt',
  ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt = 'ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt',
  ProcessSDKOutboundBulkQuotesRequestCmdEvt = 'ProcessSDKOutboundBulkQuotesRequestCmdEvt',
  ProcessBulkQuotesCallbackCmdEvt = 'ProcessBulkQuotesCallbackCmdEvt',
  ProcessSDKOutboundBulkAcceptQuoteCmdEvt = 'ProcessSDKOutboundBulkAcceptQuoteCmdEvt',
  ProcessSDKOutboundBulkTransfersRequestCmdEvt = 'ProcessSDKOutboundBulkTransfersRequestCmdEvt',
  ProcessBulkTransfersCallbackCmdEvt = 'ProcessBulkTransfersCallbackCmdEvt',
  PrepareSDKOutboundBulkResponseCmdEvt = 'PrepareSDKOutboundBulkResponseCmdEvt',
  ProcessSDKOutboundBulkResponseSentCmdEvt = 'ProcessSDKOutboundBulkResponseSentCmdEvt',
}

export type IProcessHelperGenerateOptions = {
  bulkTransactionRequest?: {
    bulkTransactionId?: string,
    options: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest['options']
  },
  StopAfterEvent?: StopAfterEventEnum,
  messageTimeout?: number,
};

export type GenerateReturn = {
    bulkTransactionId: string,
    amountList?: string[],
    quoteAmountList?: string[],
    individualTransferIds?: string[],
    bulkBatchIds?: string[],
    domainEvents?: Array<DomainEvent>;
}

// TODO: First iteration of a quick and dirty Test Helper for Integration Tests.
export class ProcessHelper {

  public domainEvents: Array<DomainEvent> = [];
  public bulkTransactionRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest;
  public bulkTransactionEntityRepo: IBulkTransactionEntityRepo;
  public commandEventProducer: ICommandEventProducer;
  public domainEventProducer: IDomainEventProducer;
  public domainEventConsumer: IEventConsumer;
  private logger: ILogger;

  constructor(
    redisBulkTransactionStateRepoOptions: IRedisBulkTransactionStateRepoOptions,
    kafkaDomainEventProducerOptions: IKafkaEventProducerOptions,
    kafkaCommandEventProducerOptions: IKafkaEventProducerOptions,
    kafkaEventConsumerOptions: IKafkaEventConsumerOptions,
    logger: ILogger
  ) {
    this.bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(redisBulkTransactionStateRepoOptions, logger);
    this.commandEventProducer = new KafkaCommandEventProducer(kafkaCommandEventProducerOptions, logger);
    this.domainEventProducer = new KafkaDomainEventProducer(kafkaDomainEventProducerOptions, logger);
    this.domainEventConsumer = new KafkaDomainEventConsumer(this._messageHandler.bind(this), kafkaEventConsumerOptions, logger)
    this.logger = logger;
  }

  async init() {
    await this.domainEventProducer.init();
    await this.commandEventProducer.init();
    await this.domainEventConsumer.init();
    await this.domainEventConsumer.start();
    await this.bulkTransactionEntityRepo.init();
  }

  async destroy() {
    await this.domainEventProducer.destroy();
    await this.commandEventProducer.destroy();
    await this.domainEventConsumer.destroy();
    await this.bulkTransactionEntityRepo.destroy();
  }

  resetDomainEvents() {
    this.domainEvents = [];
  }

  getDomainEvents(){
    return this.domainEvents;
  }

  private _messageHandler = async (message: DomainEvent): Promise<void>  => {
    this.logger.info('Domain Message: ', message);
    this.domainEvents.push(message);
  }

  // TODO: This is currently semi-hardcoded to the bulkRequest as per below,
  //       with no logic to cater for bulkTransactionRequest.options (e.g. autoAccept*, synchronous, etc) configs
  //       ...
  async generate (
      options: IProcessHelperGenerateOptions = {
        messageTimeout: 2000
      }
  ): Promise<GenerateReturn> {
    const bulkTransactionId = options?.bulkTransactionRequest?.bulkTransactionId || randomUUID();

    const defaultBulkTransactionOptions: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest['options'] = {
      onlyValidateParty: true,
      autoAcceptParty: {
        enabled: false
      },
      autoAcceptQuote: {
        enabled: false,
      },
      skipPartyLookup: false,
      synchronous: false,
      bulkExpiration: "2016-05-24T08:38:08.699-04:00"
    };

    const bulkTransactionOptions: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest['options'] = {
      ... defaultBulkTransactionOptions,
      ... options?.bulkTransactionRequest?.options
    };

    const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
      bulkHomeTransactionID: "string",
      bulkTransactionId: bulkTransactionId,
      options: bulkTransactionOptions,
      from: {
        partyIdInfo: {
          partyIdType: "MSISDN",
          partyIdentifier: "16135551212",
          fspId: "string",
        },
      },
      individualTransfers: [
        {
          homeTransactionId: randomUUID(),
          to: {
            partyIdInfo: {
              partyIdType: "MSISDN",
              partyIdentifier: "1"
            },
          },
          amountType: "SEND",
          currency: "USD",
          amount: "1",
        },
        {
          homeTransactionId: randomUUID(),
          to: {
            partyIdInfo: {
              partyIdType: "MSISDN",
              partyIdentifier: "2"
            },
          },
          amountType: "SEND",
          currency: "USD",
          amount: "2",
        },
        {
          homeTransactionId: randomUUID(),
          to: {
            partyIdInfo: {
              partyIdType: "MSISDN",
              partyIdentifier: "3"
            },
          },
          amountType: "SEND",
          currency: "USD",
          amount: "3",
        },
        {
          homeTransactionId: randomUUID(),
          to: {
            partyIdInfo: {
              partyIdType: "MSISDN",
              partyIdentifier: "4"
            },
          },
          amountType: "SEND",
          currency: "USD",
          amount: "4",
        }
      ]
    }

    this.bulkTransactionRequest = bulkRequest;

    const messageTimeout = options.messageTimeout || 2000;

    const sampleCommandEventData: IProcessSDKOutboundBulkRequestCmdEvtData = {
      bulkRequest,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkRequestMessageObj = new ProcessSDKOutboundBulkRequestCmdEvt(sampleCommandEventData);
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkRequestMessageObj);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkRequestCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkRequestCmdEvt}`);
      return {
        bulkTransactionId,
        // amountList,
        // quoteAmountList,
        // individualTransferIds: randomGeneratedTransferIds,
        // bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(
      bulkPartyInfoRequestCommandEventData
    );
    await this.commandEventProducer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkPartyInfoRequestCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkPartyInfoRequestCmdEvt}`);
      return {
        bulkTransactionId,
        // amountList,
        // quoteAmountList,
        // individualTransferIds: randomGeneratedTransferIds,
        // bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    // Get the randomly generated transferIds for the callback
    const randomGeneratedTransferIds = await this.bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // The transfer ids are unordered so using the transfer amounts to identify each transfer
    // so we can reference the proper transferId in subsequent callbacks
    const amountList: string[] = []
    amountList.push((await this.bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[0])).request.amount)
    amountList.push((await this.bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[1])).request.amount)
    amountList.push((await this.bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[2])).request.amount)
    amountList.push((await this.bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[3])).request.amount)

    // Simulate the domain handler sending the command handler PProcessPartyInfoCallback messages
    // for each individual transfer
    const processPartyInfoCallbackMessageData1: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[amountList.indexOf('1')],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: SDKOutboundTransferState.COMPLETED
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageData2: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[amountList.indexOf('2')],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: SDKOutboundTransferState.COMPLETED
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageData3: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[amountList.indexOf('3')],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '11111111111',
                  fspId: 'differentfsp'
              }
          },
          currentState: SDKOutboundTransferState.COMPLETED
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageData4: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[amountList.indexOf('4')],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '222222222222',
                  fspId: 'differentfsp'
              }
          },
          currentState: SDKOutboundTransferState.COMPLETED
        },
      },
      timestamp: Date.now(),
      headers: []
    }

    const processPartyInfoCallbackMessageObjOne = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData1);
    await this.commandEventProducer.sendCommandEvent(processPartyInfoCallbackMessageObjOne);
    const processPartyInfoCallbackMessageObjTwo = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
    await this.commandEventProducer.sendCommandEvent(processPartyInfoCallbackMessageObjTwo);
    const processPartyInfoCallbackMessageObjThree = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData3);
    await this.commandEventProducer.sendCommandEvent(processPartyInfoCallbackMessageObjThree);
    const processPartyInfoCallbackMessageObjFour = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData4);
    await this.commandEventProducer.sendCommandEvent(processPartyInfoCallbackMessageObjFour);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessPartyInfoCallbackCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessPartyInfoCallbackCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        // quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        // bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    // Command event for bulk accept party info
    const processSDKOutboundBulkAcceptPartyInfoCommandEventData : IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        individualTransfers: [
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('1')],
            acceptParty: true
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('2')],
            acceptParty: true
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('3')],
            acceptParty: true
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('4')],
            acceptParty: true
          }
        ]
      },
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkAcceptPartyInfoCommandEventObj = new ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt(
      processSDKOutboundBulkAcceptPartyInfoCommandEventData
    );
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkAcceptPartyInfoCommandEventObj);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        // quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        // bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    // Simulate domain handler sending command event for bulk quotes request
    const processSDKOutboundBulkQuotesRequestCommandEventData : IProcessSDKOutboundBulkQuotesRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkQuotesRequestCommandEventObj = new ProcessSDKOutboundBulkQuotesRequestCmdEvt(
      processSDKOutboundBulkQuotesRequestCommandEventData
    );
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkQuotesRequestCommandEventObj);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkQuotesRequestCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkQuotesRequestCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        // quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        // bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    // Check that bulk batches have been created.
    // One should be for receiverfsp and another for differentfsp
    const bulkBatchIds = await this.bulkTransactionEntityRepo.getAllBulkBatchIds(bulkTransactionId);
    // expect(bulkBatchIds[0]).toBeDefined();
    // expect(bulkBatchIds[1]).toBeDefined();

    const fetchBulkBatches = async () => {
      let bulkBatchOne = await this.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);
      let bulkBatchTwo = await this.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[1]);

      // Bulk batch ids are unordered so check the quotes for the intended fsp
      // so we can send proper callbacks
      let receiverFspBatch;
      let differentFspBatch;
      if (bulkBatchOne.bulkQuotesRequest.individualQuotes[0].to.fspId == 'receiverfsp') {
        receiverFspBatch = bulkBatchOne
        differentFspBatch = bulkBatchTwo
      } else {
        receiverFspBatch = bulkBatchTwo
        differentFspBatch = bulkBatchOne
      }
      return {
        receiverFspBatch,
        differentFspBatch
      }
    }

    // Bulk batch ids are unordered so check the quotes for the intended fsp
    // so we can send proper callbacks
    let receiverFspBatch;
    let differentFspBatch;

    let fetchBulkBatchesResults = await fetchBulkBatches();
    receiverFspBatch = fetchBulkBatchesResults.receiverFspBatch;
    differentFspBatch = fetchBulkBatchesResults.differentFspBatch;

    const bulkQuoteId = randomUUID();
    const quoteAmountList: string[] = []
    quoteAmountList.push(receiverFspBatch.bulkQuotesRequest.individualQuotes[0].amount);
    quoteAmountList.push(receiverFspBatch.bulkQuotesRequest.individualQuotes[1].amount);

    // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
    // for receiverfsp batch
    const processBulkQuotesCallbackCommandEventDataReceiverFsp : IProcessBulkQuotesCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        batchId: receiverFspBatch.id,
        bulkQuoteId: bulkQuoteId,
        bulkQuotesResult: {
          bulkQuoteId: bulkQuoteId,
          expiration: '2022-08-08T11:12:13',
          currentState: SDKOutboundTransferState.COMPLETED,
          individualQuoteResults: [
            {
              quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('1')].quoteId,
              transferAmount: {
                currency: 'USD',
                amount: '1',
              },
              ilpPacket: 'string',
              condition: 'BYZDY3HBhwqhiTtzbf4nKADcmsNVMCHCCRkYQFb5cbZ'
            },
            {
              quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('2')].quoteId,
              transferAmount: {
                currency: 'USD',
                amount: '2',
              },
              ilpPacket: 'string',
              condition: 'BYZDY3HBhwqhiTtzbf4nKADcmsNVMCHCCRkYQFb5cbZ',
              lastError: {
                httpStatusCode: 500,
                mojaloopError: {
                  errorInformation:{
                    errorCode: '0000',
                    errorDescription: 'some-error'
                  }
                }
              }
            }
          ]
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processBulkQuotesCallbackCommandEventObjReceiverFsp = new ProcessBulkQuotesCallbackCmdEvt(
      processBulkQuotesCallbackCommandEventDataReceiverFsp
    );
    await this.commandEventProducer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjReceiverFsp);

    await Timer.wait(messageTimeout);

    const bulkQuoteIdDifferentFsp = randomUUID();

    // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
    // for differentfsp batch with empty results
    // Currently only empty individualQuoteResults result in AGREEMENT_FAILED for bulk batch state
    const processBulkQuotesCallbackCommandEventDataDifferentFsp : IProcessBulkQuotesCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        batchId: differentFspBatch.id,
        bulkQuoteId: bulkQuoteIdDifferentFsp,
        bulkQuotesResult: {
          expiration: '2016-05-24T08:38:08.699-04:00',
          bulkQuoteId: bulkQuoteIdDifferentFsp,
          currentState: 'ERROR_OCCURRED',
          individualQuoteResults: []
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processBulkQuotesCallbackCommandEventObjDifferentFsp = new ProcessBulkQuotesCallbackCmdEvt(
      processBulkQuotesCallbackCommandEventDataDifferentFsp
    );
    await this.commandEventProducer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjDifferentFsp);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessBulkQuotesCallbackCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessBulkQuotesCallbackCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    const processSDKOutboundBulkAcceptQuoteCmdEvtData: IProcessSDKOutboundBulkAcceptQuoteCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptQuote: {
        individualTransfers: [
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('1')],
            acceptQuote: true
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('2')],
            acceptQuote: false
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('3')],
            acceptQuote: false
          },
          {
            transferId: randomGeneratedTransferIds[amountList.indexOf('4')],
            acceptQuote: false
          }
        ]
      },
      timestamp: Date.now(),
      headers: null
    }
    const processSDKOutboundBulkAcceptQuoteCmdEvt = new ProcessSDKOutboundBulkAcceptQuoteCmdEvt(processSDKOutboundBulkAcceptQuoteCmdEvtData)
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkAcceptQuoteCmdEvt);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkAcceptQuoteCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkAcceptQuoteCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    const processSDKOutboundBulkTransfersRequestCmdEvtData: IProcessSDKOutboundBulkTransfersRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: null
    };
    const processSDKOutboundBulkTransfersRequestCmdEvt = new ProcessSDKOutboundBulkTransfersRequestCmdEvt(processSDKOutboundBulkTransfersRequestCmdEvtData)
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkTransfersRequestCmdEvt);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkTransfersRequestCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkTransfersRequestCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    // const bulkBatchOneAfterQuotes:BulkBatchState = await this.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);

    fetchBulkBatchesResults = await fetchBulkBatches();
    receiverFspBatch = fetchBulkBatchesResults.receiverFspBatch;
    differentFspBatch = fetchBulkBatchesResults.differentFspBatch;

    const bulkTransferId = randomUUID();
    const transferAmountList: string[] = []
    transferAmountList.push(receiverFspBatch.bulkTransfersRequest.individualTransfers[0].amount);

    // TODO: Need to handle a transfer callback that is errored
    const processBulkTransfersCallbackCmdEvtData: IProcessBulkTransfersCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        batchId: receiverFspBatch.id,
        bulkTransfersResult: {
          bulkTransferId: receiverFspBatch.bulkTransfersRequest.bulkTransferId,
          bulkQuoteId: receiverFspBatch.bulkTransfersRequest.bulkQuoteId,
          homeTransactionId: receiverFspBatch.bulkTransfersRequest.homeTransactionId,
          bulkTransferState: 'COMMITTED',
          completedTimestamp: (new Date()).toISOString(),
          currentState: "COMPLETED",
          individualTransferResults: [
            {
              transferId: receiverFspBatch.bulkTransfersRequest.individualTransfers[0].transferId,
              fulfilment: 'fulfilment',
            }
          ]
        }
      },
      timestamp: Date.now(),
      headers: null
    };

    const processBulkTransfersCallbackCmdEvt = new ProcessBulkTransfersCallbackCmdEvt(processBulkTransfersCallbackCmdEvtData)
    await this.commandEventProducer.sendCommandEvent(processBulkTransfersCallbackCmdEvt);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessBulkTransfersCallbackCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessBulkTransfersCallbackCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    const prepareSDKOutboundBulkResponseCmdEvt: IPrepareSDKOutboundBulkResponseCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: null
    }

    const PrepareSDKOutboundBulkResponse = new PrepareSDKOutboundBulkResponseCmdEvt(prepareSDKOutboundBulkResponseCmdEvt)
    await this.commandEventProducer.sendCommandEvent(PrepareSDKOutboundBulkResponse);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.PrepareSDKOutboundBulkResponseCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.PrepareSDKOutboundBulkResponseCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    const processSDKOutboundBulkResponseSentCmdEvtData: IProcessSDKOutboundBulkResponseSentCmdEvtData = {
      bulkId: bulkTransactionId,
      content: null,
      timestamp: Date.now(),
      headers: null
    }

    const processSDKOutboundBulkResponseSentCmdEvt = new ProcessSDKOutboundBulkResponseSentCmdEvt(processSDKOutboundBulkResponseSentCmdEvtData)
    await this.commandEventProducer.sendCommandEvent(processSDKOutboundBulkResponseSentCmdEvt);

    await Timer.wait(messageTimeout);

    if (options.StopAfterEvent === StopAfterEventEnum.ProcessSDKOutboundBulkResponseSentCmdEvt) {
      this.logger.warn(`ProcessHelper - Stopping at StopAfterEvent=${StopAfterEventEnum.ProcessSDKOutboundBulkResponseSentCmdEvt}`);
      return {
        bulkTransactionId,
        amountList,
        quoteAmountList,
        individualTransferIds: randomGeneratedTransferIds,
        bulkBatchIds,
        domainEvents: this.domainEvents
      }
    };

    return {
      bulkTransactionId,
      amountList,
      quoteAmountList,
      individualTransferIds: randomGeneratedTransferIds,
      bulkBatchIds,
      domainEvents: this.domainEvents
    }
  }
}
