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

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SDKSchemeAdapter } from "@mojaloop/api-snippets";

import {
    BulkBatchInternalState,
    BulkQuotesCallbackProcessedDmEvt,
    BulkTransactionInternalState,
    DomainEvent,
    IKafkaEventConsumerOptions,
    IKafkaEventProducerOptions,
    IndividualTransferInternalState,
    IProcessBulkQuotesCallbackCmdEvtData,
    IProcessPartyInfoCallbackCmdEvtData,
    IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData,
    IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
    IProcessSDKOutboundBulkQuotesRequestCmdEvtData,
    IProcessSDKOutboundBulkRequestCmdEvtData,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    KafkaDomainEventConsumer,
    ProcessBulkQuotesCallbackCmdEvt,
    ProcessPartyInfoCallbackCmdEvt,
    ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt,
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
    ProcessSDKOutboundBulkQuotesRequestCmdEvt,
    ProcessSDKOutboundBulkRequestCmdEvt,
    RedisBulkTransactionStateRepo,
    SDKOutboundBulkQuotesRequestProcessedDmEvt,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { randomUUID } from "crypto";
import { Timer } from "../../../util/timer";

 // Tests can timeout in a CI pipeline so giving it leeway
 jest.setTimeout(30000)

 const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here
 const messageTimeout = 2000;

 // Setup for Kafka Producer
 const commandEventProducerOptions: IKafkaEventProducerOptions = {
     brokerList: 'localhost:9092',
     clientId: 'test-integration_client_id',
     topic: 'topic-sdk-outbound-command-events'
 }
 const producer = new KafkaCommandEventProducer(commandEventProducerOptions, logger)

 // Setup for Kafka Consumer
 const domainEventConsumerOptions: IKafkaEventConsumerOptions = {
   brokerList: 'localhost:9092',
   clientId: 'test-integration_client_id',
   topics: ['topic-sdk-outbound-domain-events'],
   groupId: "domain_events_consumer_client_id"
 }
 var domainEvents: Array<DomainEvent> = []
 const _messageHandler = async (message: DomainEvent): Promise<void>  => {
   console.log('Domain Message: ', message);
   domainEvents.push(message);
 }
 const consumer = new KafkaDomainEventConsumer(_messageHandler.bind(this), domainEventConsumerOptions, logger)

 // Setup for Redis access
 const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
   connStr: 'redis://localhost:6379'
 }
 const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);


 describe("Tests for ProcessBulkQuotesCallback Event Handler", () => {

   beforeEach(async () => {
     domainEvents = [];
   });

   beforeAll(async () => {
     await producer.init();
     await consumer.init();
     await consumer.start();
     await bulkTransactionEntityRepo.init();
   });

   afterAll(async () => {
     await producer.destroy();
     await consumer.destroy();
     await bulkTransactionEntityRepo.destroy();
   });

   test("Given the BulkTransaction with Options { \
      synchronous: false, \
      onlyValidateParty: true, \
      skipPartyLookup: false, \
      autoAcceptParty: false, \
      autoAcceptQuote: false \
    } \
    And callback for quote batch is successful \
    And the callback has a combination of success and failed responses for individual quotes \
    When Inbound command event ProcessBulkQuotesCallback is received \
    Then the logic should update the individual batch state to AGREEMENT_COMPLETED or AGREEMENT_FAILED, \
    And for each individual transfers in the batch, the state could be AGREEMENT_SUCCESS or AGREEMENT_FAILED accordingly \
    And the individual quote data in redis should be updated with the response \
    And the global BulkTransaction state should be AGREEMENT_ACCEPTANCE_PENDING \
    And domain event BulkQuotesCallbackProcessed should be published \
    And domain event SDKOutboundBulkQuotesRequestProcessed should be published", async () => {
      // SETUP

      // Publish this message so that it is stored internally in redis
      const bulkTransactionId = randomUUID();
      const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
        bulkHomeTransactionID: "string",
        bulkTransactionId: bulkTransactionId,
        options: {
          onlyValidateParty: true,
          autoAcceptParty: {
            enabled: false,
          },
          autoAcceptQuote: {
            enabled: false,
          },
          skipPartyLookup: false,
          synchronous: false,
          bulkExpiration: "2016-05-24T08:38:08.699-04:00" // TODO: should this not be generated?
        },
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
      const sampleCommandEventData: IProcessSDKOutboundBulkRequestCmdEvtData = {
        bulkRequest,
        timestamp: Date.now(),
        headers: []
      }
      const processSDKOutboundBulkRequestMessageObj = new ProcessSDKOutboundBulkRequestCmdEvt(sampleCommandEventData);
      await producer.sendCommandEvent(processSDKOutboundBulkRequestMessageObj);
      await Timer.wait(messageTimeout);

      const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
        bulkId: bulkTransactionId,
        timestamp: Date.now(),
        headers: []
      }
      const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(
        bulkPartyInfoRequestCommandEventData
      );
      await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);
      await Timer.wait(messageTimeout);

      // Get the randomly generated transferIds for the callback
      const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

      // The transfer ids are unordered so using the transfer amounts to identify each transfer
      // so we can reference the proper transferId in subsequent callbacks
      const amountList: string[] = []
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[0])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[1])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[2])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[3])).request.amount)

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
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjOne);
      const processPartyInfoCallbackMessageObjTwo = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjTwo);
      const processPartyInfoCallbackMessageObjThree = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData3);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjThree);
      const processPartyInfoCallbackMessageObjFour = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData4);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjFour);
      await Timer.wait(messageTimeout);

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
      await producer.sendCommandEvent(processSDKOutboundBulkAcceptPartyInfoCommandEventObj);
      await Timer.wait(messageTimeout);

      // Simulate domain handler sending command event for bulk quotes request
      const processSDKOutboundBulkQuotesRequestCommandEventData : IProcessSDKOutboundBulkQuotesRequestCmdEvtData = {
        bulkId: bulkTransactionId,
        timestamp: Date.now(),
        headers: []
      }
      const processSDKOutboundBulkQuotesRequestCommandEventObj = new ProcessSDKOutboundBulkQuotesRequestCmdEvt(
        processSDKOutboundBulkQuotesRequestCommandEventData
      );
      await producer.sendCommandEvent(processSDKOutboundBulkQuotesRequestCommandEventObj);
      await Timer.wait(messageTimeout);

      // Check that bulk batches have been created.
      // One should be for receiverfsp and another for differentfsp
      const bulkBatchIds = await bulkTransactionEntityRepo.getAllBulkBatchIds(bulkTransactionId);
      expect(bulkBatchIds[0]).toBeDefined();
      expect(bulkBatchIds[1]).toBeDefined();

      const bulkBatchOne = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);
      const bulkBatchTwo = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[1]);

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

      const bulkQuoteId = randomUUID();
      const quoteAmountList: string[] = []
      quoteAmountList.push(receiverFspBatch.bulkQuotesRequest.individualQuotes[0].amount);
      quoteAmountList.push(receiverFspBatch.bulkQuotesRequest.individualQuotes[1].amount);

      // ACT

      // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
      // for receiverfsp batch
      const processBulkQuotesCallbackCommandEventDataReceiverFsp : IProcessBulkQuotesCallbackCmdEvtData = {
        bulkId: bulkTransactionId,
        content: {
          batchId: receiverFspBatch.id,
          bulkQuoteId: bulkQuoteId,
          bulkQuotesResult: {
            bulkQuoteId: bulkQuoteId,
            expiration: '2016-05-24T08:38:08.699-04:00',
            currentState: SDKOutboundTransferState.COMPLETED,
            individualQuoteResults: [
              {
                quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('1')].quoteId,
                transferAmount: {
                  currency: 'USD',
                  amount: '1',
                },
                ilpPacket: 'string',
                condition: 'string'
              },
              {
                quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('2')].quoteId,
                transferAmount: {
                  currency: 'USD',
                  amount: '2',
                },
                ilpPacket: 'string',
                condition: 'string',
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
      await producer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjReceiverFsp);
      await Timer.wait(messageTimeout);

      const bulkQuoteIdDifferentFsp = randomUUID();

      // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
      // for differentfsp batch with empty results
      // Currently only empty individualQuoteResults result in AGREEMENT_FAILED for bulk batch state
      const processBulkQuotesCallbackCommandEventDataDifferentFsp : IProcessBulkQuotesCallbackCmdEvtData = {
        bulkId: bulkTransactionId,
        content: {
          batchId: differentFspBatch.id,
          bulkQuoteId: bulkQuoteId,
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
      await producer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjDifferentFsp);
      await Timer.wait(messageTimeout);

      // ASSERT

      // Check that the state of bulk batch for receiverfsp to be AGREEMENT_COMPLETED
      const postBulkBatchReceiverFsp = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, receiverFspBatch.id);
      expect(postBulkBatchReceiverFsp.state).toBe(BulkBatchInternalState.AGREEMENT_COMPLETED);

      // Check that bulkQuoteResponse state has been updated to COMPLETED
      expect(postBulkBatchReceiverFsp.bulkQuotesResponse!.currentState).toEqual("COMPLETED")

      // Check that the state of bulk batch for differentfsp to be AGREEMENT_FAILED
      const postBulkBatchDifferentFsp = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, differentFspBatch.id);
      expect(postBulkBatchDifferentFsp.state).toBe(BulkBatchInternalState.AGREEMENT_FAILED);

      // Check that bulkQuoteResponse state has been updated to ERROR_OCCURRED
      expect(postBulkBatchDifferentFsp.bulkQuotesResponse!.currentState).toEqual("ERROR_OCCURRED")

      // Check the individual transfer state whose quote was successful in a successful bulk quote batch
      const individualTransfer1 = await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('1')])
      expect(individualTransfer1.state)
      .toBe(IndividualTransferInternalState.AGREEMENT_SUCCESS);

      // Check the individual transfer state whose quote was errored in a successful bulk quote batch
      const individualTransfer2 = await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('2')])
      expect(individualTransfer2.state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

      // Check the individual transfer state whose quotes were in an errored bulk quote batch
      const individualTransfer3 = await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('3')])
      expect(individualTransfer3.state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

      const individualTransfer4 = await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('4')])
      expect(individualTransfer4.state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

      // Now that all the bulk batches have reached a final state check the global state
      // Check that the global state of bulk to be AGREEMENT_ACCEPTANCE_PENDING
      const bulkStateAgreementCompleted = await bulkTransactionEntityRepo.load(bulkTransactionId);
      expect(bulkStateAgreementCompleted.state).toBe(BulkTransactionInternalState.AGREEMENT_ACCEPTANCE_PENDING);

      // Check that command handler published BulkQuotesCallbackProcessed message
      const hasBulkQuotesCallbackProcessed = (domainEvents.find((e) => e.getName() === BulkQuotesCallbackProcessedDmEvt.name));
      expect(hasBulkQuotesCallbackProcessed).toBeTruthy();

      // Check that command handler published SDKOutboundBulkQuotesRequestProcessed message
      const hasSDKOutboundBulkQuotesRequestProcessed = (domainEvents.find((e) => e.getName() === SDKOutboundBulkQuotesRequestProcessedDmEvt.name));
      expect(hasSDKOutboundBulkQuotesRequestProcessed).toBeTruthy();
    });

    // TODO: @Sri to investigate as to why this test is passing -
    // Given the BulkTransaction with Options {
    //  synchronous: true, <-- this is currently unsupported
    //  onlyValidateParty: true,
    //  skipPartyLookup: false,
    //  autoAcceptParty: true, <-- this is currently unsupported
    //  autoAcceptQuote: true <-- this is currently unsupported
    // }
    test.skip("Given the callback for quote batch is successful \
         And the callback has a combination of success and failed responses for individual quotes \
         When Inbound command event ProcessBulkQuotesCallback is received \
         Then the logic should update the individual batch state to AGREEMENT_COMPLETED or AGREEMENT_FAILED, \
         And for each individual transfers in the batch, the state could be AGREEMENT_SUCCESS or AGREEMENT_FAILED accordingly \
         And the individual quote data in redis should be updated with the response \
         And domain event BulkQuotesCallbackProcessed should be published \
         And domain event SDKOutboundBulkQuotesRequestProcessed should be published", async () => {
      // Publish this message so that it is stored internally in redis
      const bulkTransactionId = randomUUID();
      const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
        bulkHomeTransactionID: "string",
        bulkTransactionId: bulkTransactionId,
        options: {
          onlyValidateParty: true,
          autoAcceptParty: {
            enabled: true,
          },
          autoAcceptQuote: {
            enabled: true,
          },
          skipPartyLookup: false,
          synchronous: true,
          bulkExpiration: "2016-05-24T08:38:08.699-04:00"
        },
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
      const sampleCommandEventData: IProcessSDKOutboundBulkRequestCmdEvtData = {
        bulkRequest,
        timestamp: Date.now(),
        headers: []
      }
      const processSDKOutboundBulkRequestMessageObj = new ProcessSDKOutboundBulkRequestCmdEvt(sampleCommandEventData);
      await producer.sendCommandEvent(processSDKOutboundBulkRequestMessageObj);
      await Timer.wait(messageTimeout);

      const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
        bulkId: bulkTransactionId,
        timestamp: Date.now(),
        headers: []
      }
      const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(
        bulkPartyInfoRequestCommandEventData
      );
      await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);
      await Timer.wait(messageTimeout);

      // Get the randomly generated transferIds for the callback
      const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

      // The transfer ids are unordered so using the transfer amounts to identify each transfer
      // so we can reference the proper transferId in subsequent callbacks
      const amountList: string[] = []
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[0])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[1])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[2])).request.amount)
      amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[3])).request.amount)

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
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjOne);
      const processPartyInfoCallbackMessageObjTwo = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjTwo);
      const processPartyInfoCallbackMessageObjThree = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData3);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjThree);
      const processPartyInfoCallbackMessageObjFour = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData4);
      await producer.sendCommandEvent(processPartyInfoCallbackMessageObjFour);
      await Timer.wait(messageTimeout);

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
      await producer.sendCommandEvent(processSDKOutboundBulkAcceptPartyInfoCommandEventObj);
      await Timer.wait(messageTimeout);

      // Simulate domain handler sending command event for bulk quotes request
      const processSDKOutboundBulkQuotesRequestCommandEventData : IProcessSDKOutboundBulkQuotesRequestCmdEvtData = {
        bulkId: bulkTransactionId,
        timestamp: Date.now(),
        headers: []
      }
      const processSDKOutboundBulkQuotesRequestCommandEventObj = new ProcessSDKOutboundBulkQuotesRequestCmdEvt(
        processSDKOutboundBulkQuotesRequestCommandEventData
      );
      await producer.sendCommandEvent(processSDKOutboundBulkQuotesRequestCommandEventObj);
      await Timer.wait(messageTimeout);

      // Check that bulk batches have been created.
      // One should be for receiverfsp and another for differentfsp
      const bulkBatchIds = await bulkTransactionEntityRepo.getAllBulkBatchIds(bulkTransactionId);
      expect(bulkBatchIds[0]).toBeDefined();
      expect(bulkBatchIds[1]).toBeDefined();

      const bulkBatchOne = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);
      const bulkBatchTwo = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[1]);

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
            expiration: '2016-05-24T08:38:08.699-04:00',
            currentState: SDKOutboundTransferState.COMPLETED,
            individualQuoteResults: [
              {
                quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('1')].quoteId,
                transferAmount: {
                  currency: 'USD',
                  amount: '1',
                },
                ilpPacket: 'string',
                condition: 'string'
              },
              {
                quoteId: receiverFspBatch.bulkQuotesRequest.individualQuotes[quoteAmountList.indexOf('2')].quoteId,
                transferAmount: {
                  currency: 'USD',
                  amount: '2',
                },
                ilpPacket: 'string',
                condition: 'string',
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
      await producer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjReceiverFsp);
      await Timer.wait(messageTimeout);

      const bulkQuoteIdDifferentFsp = randomUUID();

      // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
      // for differentfsp batch with empty results
      // Currently only empty individualQuoteResults result in AGREEMENT_FAILED for bulk batch state
      const processBulkQuotesCallbackCommandEventDataDifferentFsp : IProcessBulkQuotesCallbackCmdEvtData = {
        bulkId: bulkTransactionId,
        content: {
          batchId: differentFspBatch.id,
          bulkQuoteId: bulkQuoteId,
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
      await producer.sendCommandEvent(processBulkQuotesCallbackCommandEventObjDifferentFsp);
      await Timer.wait(messageTimeout);

      // Check that the state of bulk batch for receiverfsp to be AGREEMENT_COMPLETED
      const postBulkBatchReceiverFsp = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, receiverFspBatch.id);
      expect(postBulkBatchReceiverFsp.state).toBe(BulkBatchInternalState.AGREEMENT_COMPLETED);

      // Check that bulkQuoteResponse state has been updated to COMPLETED
      expect(postBulkBatchReceiverFsp.bulkQuotesResponse!.currentState).toEqual("COMPLETED")

      // Check that the state of bulk batch for differentfsp to be AGREEMENT_FAILED
      const postBulkBatchDifferentFsp = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, differentFspBatch.id);
      expect(postBulkBatchDifferentFsp.state).toBe(BulkBatchInternalState.AGREEMENT_FAILED);

      // Check that bulkQuoteResponse state has been updated to ERROR_OCCURRED
      expect(postBulkBatchDifferentFsp.bulkQuotesResponse!.currentState).toEqual("ERROR_OCCURRED")

      // Check the individual transfer state whose quote was successful in a successful bulk quote batch
      expect((await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('1')])).state)
      .toBe(IndividualTransferInternalState.AGREEMENT_SUCCESS);

      // Check the individual transfer state whose quote was errored in a successful bulk quote batch
      expect((await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('2')])).state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

      // Check the individual transfer state whose quotes were in an errored bulk quote batch
      expect((await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('3')])).state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);
      expect((await bulkTransactionEntityRepo.getIndividualTransfer(
        bulkTransactionId,
        randomGeneratedTransferIds[amountList.indexOf('4')])).state)
      .toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

      // Now that all the bulk batches have reached a final state check the global state
      // Check that the global state of bulk to be AGREEMENT_COMPLETED
      const bulkStateAgreementCompleted = await bulkTransactionEntityRepo.load(bulkTransactionId);
      expect(bulkStateAgreementCompleted.state).toBe(BulkTransactionInternalState.AGREEMENT_COMPLETED);

      // Check that command handler published BulkQuotesCallbackProcessed message
      const hasBulkQuotesCallbackProcessed = (domainEvents.find((e) => e.getName() === BulkQuotesCallbackProcessedDmEvt.name));
      expect(hasBulkQuotesCallbackProcessed).toBeTruthy();

      // Check that command handler published SDKOutboundBulkQuotesRequestProcessed message
      const hasSDKOutboundBulkQuotesRequestProcessed = (domainEvents.find((e) => e.getName() === SDKOutboundBulkQuotesRequestProcessedDmEvt.name));
      expect(hasSDKOutboundBulkQuotesRequestProcessed).toBeTruthy();
    });

   // Skipping this since there is no easy way to programmatically control the
   // maxEntryConfigPerBatch config value atm.
   test.skip("Given the callback for quote batch is successful \
     And the callback has a combination of success and failed responses for individual quotes \
     When Inbound command event ProcessBulkQuotesCallback is received \
     Then the logic should update the individual batch state to AGREEMENT_COMPLETED, \
     And also splits quotes into batches using maxEntryConfigPerBatch \
     And for each individual quote in the batch, the state should be updated to AGREEMENT_SUCCESS or AGREEMENT_FAILED accordingly \
     And the individual quote data in redis should be updated with the response \
     And domain event BulkQuotesCallbackProcessed should be published \
     And domain event SDKOutboundBulkQuotesRequestProcessed should be published",
   async () => {});
 });
