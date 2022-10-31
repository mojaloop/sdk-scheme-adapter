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

 - Sridevi Miriyala <sridevi.miriyala@modusbox.com>
 - Kevin Leyow <kevin.leyow@modusbox.com>
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

import {
    BulkTransactionInternalState,
    DomainEvent,
    IKafkaEventConsumerOptions,
    IKafkaEventProducerOptions,
    IProcessPartyInfoCallbackCmdEvtData,
    IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData,
    IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
    IProcessSDKOutboundBulkQuotesRequestCmdEvtData,
    IProcessSDKOutboundBulkRequestCmdEvtData,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    KafkaDomainEventConsumer,
    ProcessPartyInfoCallbackCmdEvt,
    ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt,
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
    ProcessSDKOutboundBulkQuotesRequestCmdEvt,
    ProcessSDKOutboundBulkRequestCmdEvt,
    RedisBulkTransactionStateRepo,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { randomUUID } from "crypto";

// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(20000)

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

describe("Tests for ProcessSDKOutboundBulkQuotesRequest Event Handler", () => {

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

  test("When Inbound command event ProcessSDKOutboundBulkQuotesRequest is received\
      Then the logic should update the global state to AGREEMENT_PROCESSING, \
      And create batches based on FSP that has DISCOVERY_ACCEPTED state \
      And also has config maxEntryConfigPerBatch \
      And publish BulkQuotesRequested per each batch \
      And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
    // Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionRequest = {
      bulkHomeTransactionID: "string",
      bulkTransactionId: bulkTransactionId,
      options: {
        onlyValidateParty: true,
        autoAcceptParty: {
          enabled: true
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
              partyIdentifier: "16135551212"
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
              partyIdentifier: "16135551213"
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
              partyIdentifier: "16135551214"
            },
          },
          amountType: "SEND",
          currency: "USD",
          amount: "3",
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
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(
      bulkPartyInfoRequestCommandEventData
    );
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Get the randomly generated transferIds for the callback
    const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // The transfer ids are unordered so using the transfer amounts to identify each transfer
    // so we can reference the proper transferId in subsequent callbacks
    const amountList: string[] = []
    amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[0])).request.amount)
    amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[1])).request.amount)
    amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[2])).request.amount)

    // Simulate the domain handler sending the command handler ProcessPartyInfoCallback messages
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
                  partyIdentifier: '678999',
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
                  partyIdentifier: '123456',
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
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Command event for sdk outbound accept bulk party info request
    const processSDKOutboundBulkAcceptPartyInfoCommandEventData : IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        bulkHomeTransactionID: 'string',
        individualTransfers: [
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[amountList.indexOf('1')],
            acceptParty: true
          },
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[amountList.indexOf('2')],
            acceptParty: false
          },
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[amountList.indexOf('3')],
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
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Simulate domain handler sending command event for sdk outbound bulk quotes request
    const processSDKOutboundBulkQuotesRequestCommandEventData : IProcessSDKOutboundBulkQuotesRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkQuotesRequestCommandEventObj = new ProcessSDKOutboundBulkQuotesRequestCmdEvt(
      processSDKOutboundBulkQuotesRequestCommandEventData
    );
    await producer.sendCommandEvent(processSDKOutboundBulkQuotesRequestCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Check that the global state of bulk to be AGREEMENT_PROCESSING
    const bulkStateThree = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateThree.state).toBe(BulkTransactionInternalState.AGREEMENT_PROCESSING);

    // Check that command handler published BulkQuotesRequested message
    const hasBulkQuotesRequested = (domainEvents.find((e) => e.getName() === 'BulkQuotesRequestedDmEvt'));
    expect(hasBulkQuotesRequested).toBeTruthy();

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
      receiverFspBatch = bulkBatchOne;
      differentFspBatch = bulkBatchTwo;
    } else {
      receiverFspBatch = bulkBatchTwo;
      differentFspBatch = bulkBatchOne;
    }

    // Assert that the quote number match the accepted parties
    // Assert the bulk batch state is AGREEMENT_PROCESSING
    // Assert that the reject party was not added in bulk batch
    expect(receiverFspBatch.state).toEqual(BulkTransactionInternalState.AGREEMENT_PROCESSING);
    expect(receiverFspBatch.bulkQuotesRequest.individualQuotes.length).toEqual(1);
    expect(receiverFspBatch.bulkQuotesRequest.individualQuotes[0].to.fspId).toEqual('receiverfsp');
    expect(receiverFspBatch.bulkQuotesRequest.individualQuotes[0].to.idValue).not.toEqual('678999');

    // Assert that the quote number match the accepted parties.
    // Assert the bulk batch state is AGREEMENT_PROCESSING
    // Assert that the reject party was not added in bulk batch
    expect(differentFspBatch.state).toEqual(BulkTransactionInternalState.AGREEMENT_PROCESSING);
    expect(differentFspBatch.bulkQuotesRequest.individualQuotes.length).toEqual(1);
    expect(differentFspBatch.bulkQuotesRequest.individualQuotes[0].to.fspId).toEqual('differentfsp');
    expect(differentFspBatch.bulkQuotesRequest.individualQuotes[0].to.idValue).not.toEqual('678999');
  });
});
