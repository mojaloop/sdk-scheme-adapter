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
import { SDKSchemeAdapter } from "@mojaloop/api-snippets";

import { DomainEvent,
        KafkaCommandEventProducer,
        IKafkaEventProducerOptions,
        KafkaDomainEventConsumer,
        IKafkaEventConsumerOptions,
        RedisBulkTransactionStateRepo,
        IRedisBulkTransactionStateRepoOptions,
        IProcessSDKOutboundBulkRequestCmdEvtData,
        ProcessSDKOutboundBulkRequestCmdEvt,
        IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
        ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
        IProcessPartyInfoCallbackCmdEvtData,
        ProcessPartyInfoCallbackCmdEvt,
        IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData,
        ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt,
        IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData,
        ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt,
        BulkTransactionInternalState,
        IndividualTransferInternalState,
        IProcessSDKOutboundBulkQuotesRequestCmdEvtData,
        ProcessSDKOutboundBulkQuotesRequestCmdEvt,
        ProcessBulkQuotesCallbackCmdEvt,
        IProcessBulkQuotesCallbackCmdEvtData,
} from "@mojaloop/sdk-scheme-adapter-private-shared-lib"
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


describe("Tests for Outbound Command Event Handler", () => {

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

  test("Given Inbound command event ProcessBulkQuotesCallback for success requests \
      Then the logic should update the individual batch state to AGREEMENT_PROCESSING, \
      And create batches based on FSP that has DISCOVERY_ACCEPTED state \
      And publish BulkQuotesRequested per each batch \
      And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
    // Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
          amount: "123.45",
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
          amount: "456.78",
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

    // Check that the command handler sends 2 messages requesting party info.
    const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');
    expect(partyInfoRequestedDomainEvents.length).toEqual(bulkRequest.individualTransfers.length);

    // Get the randomly generated transferIds for the callback
    const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // Simulate the domain handler sending the command handler PProcessPartyInfoCallback messages
    // for each individual transfer
    const processPartyInfoCallbackMessageData1: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[0],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: 'COMPLETED'
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageData2: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[1],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: 'COMPLETED'
        },
      },
      timestamp: Date.now(),
      headers: []
    }

    const processPartyInfoCallbackMessageObjOne = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData1);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObjOne);
    const processPartyInfoCallbackMessageObjTwo = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObjTwo);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Simulate the domain handler sending the command handler ProcessSDKOutboundBulkPartyInfoRequestComplete message
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(
      processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData
    );
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Check that the global state to be DISCOVERY_COMPLETED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();

    // Command event for bulk party info request completed
    const processSDKOutboundBulkAcceptPartyInfoCommandEventData : IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        bulkHomeTransactionID: 'string',
        individualTransfers: [
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[0],
            acceptParty: true
          },
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[1],
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

    // Check that the global state to be DISCOVERY_ACCEPTANCE_COMPLETED
    const bulkStateTwo = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateTwo.state).toBe(BulkTransactionInternalState.DISCOVERY_ACCEPTANCE_COMPLETED);

    // Check that individual transfers have been updated to DISCOVERY_ACCEPTED
    const afterIndividualTransfer1 = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[0]);
    expect(afterIndividualTransfer1.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);

    const afterIndividualTransfer2 = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[1]);
    expect(afterIndividualTransfer2.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);

    // Check that command handler sends event to domain handler
    const hasSDKOutboundBulkAcceptPartyInfoProcessed = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAcceptPartyInfoProcessedDmEvt'));
    expect(hasSDKOutboundBulkAcceptPartyInfoProcessed).toBeTruthy();

    // Simulate domain handler sending command event for bulk party info request completed
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
    const bulkBatchIds = await bulkTransactionEntityRepo.getAllBulkBatchIds(bulkTransactionId);
    expect(bulkBatchIds[0]).toBeDefined();

    // Command event for bulk party info request completed
    // Get randomly generated quoteId
    const preBulkBatch = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);
    const bulkQuoteId = randomUUID();

    // Simulate the domain handler sending ProcessBulkQuotesCallback to command handler
    const processBulkQuotesCallbackCommandEventData : IProcessBulkQuotesCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        batchId: bulkBatchIds[0],
        bulkQuoteId: bulkQuoteId,
        bulkQuotesResult: {
          bulkQuoteId: bulkQuoteId,
          currentState: 'COMPLETED',
          individualQuoteResults: [
            {
              quoteId: preBulkBatch.bulkQuotesRequest.individualQuotes[0].quoteId,
              transferAmount: {
                currency: 'USD',
                amount: '123.45',
              },
              ilpPacket: 'string',
              condition: 'string'
            },
            {
              quoteId: preBulkBatch.bulkQuotesRequest.individualQuotes[0].quoteId,
              transferAmount: {
                currency: 'USD',
                amount: '456.78',
              },
              ilpPacket: 'string',
              condition: 'string'
            }
          ]
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processBulkQuotesCallbackCommandEventObj = new ProcessBulkQuotesCallbackCmdEvt(
      processBulkQuotesCallbackCommandEventData
    );
    await producer.sendCommandEvent(processBulkQuotesCallbackCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Check that the global state of bulk to be AGREEMENT_PROCESSING
    const bulkStateFour = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateFour.state).toBe(BulkTransactionInternalState.AGREEMENT_COMPLETED);

    // Check that command handler published BulkQuotesCallbackProcessed message
    const hasBulkQuotesCallbackProcessed = (domainEvents.find((e) => e.getName() === 'BulkQuotesCallbackProcessedDmEvt'));
    expect(hasBulkQuotesCallbackProcessed).toBeTruthy();
  });


  // Skipping this since there is no easy way to programmatically control the
  // maxEntryConfigPerBatch config value atm.
  test.skip("Given Inbound command event ProcessBulkQuotesCallback for success requests \
    Then the logic should update the individual batch state to AGREEMENT_PROCESSING, \
    And create batches based on FSP that has DISCOVERY_ACCEPTED state \
    And also splits transfers into batches using maxEntryConfigPerBatch \
    And publish BulkQuotesRequested per each batch \
    And update the state of each batch to AGREEMENT_PROCESSING.", async () => {

    // Set max items to 1 so it should break 2 transfers into 2 batches.
    process.env.MAX_ITEMS_PER_BATCH = '1';

    // Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
          amount: "123.45",
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
          amount: "456.78",
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

    console.log(domainEvents)
    // Check that the command handler sends 2 messages requesting party info.
    const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');
    expect(partyInfoRequestedDomainEvents.length).toEqual(bulkRequest.individualTransfers.length);

    // Get the randomly generated transferIds for the callback
    const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // Simulate the domain handler sending the command handler PProcessPartyInfoCallback messages
    // for each individual transfer
    const processPartyInfoCallbackMessageData1: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[0],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: 'COMPLETED'
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageData2: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: randomGeneratedTransferIds[1],
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: 'COMPLETED'
        },
      },
      timestamp: Date.now(),
      headers: []
    }

    const processPartyInfoCallbackMessageObj1 = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData1);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj1);
    const processPartyInfoCallbackMessageObj2 = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj2);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Simulate the domain handler sending the command handler ProcessSDKOutboundBulkPartyInfoRequestComplete message
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(
      processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData
    );
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Check that the global state to be DISCOVERY_COMPLETED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();

    // Command event for bulk party info request completed
    const processSDKOutboundBulkAcceptPartyInfoCommandEventData : IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        bulkHomeTransactionID: 'string',
        individualTransfers: [
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[0],
            acceptParty: true
          },
          {
            homeTransactionId: 'string',
            transactionId: randomGeneratedTransferIds[1],
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

    // Check that the global state to be DISCOVERY_ACCEPTANCE_COMPLETED
    const bulkStateTwo = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateTwo.state).toBe(BulkTransactionInternalState.DISCOVERY_ACCEPTANCE_COMPLETED);

    // Check that individual transfers have been updated to DISCOVERY_ACCEPTED
    const afterIndividualTransfer1 = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[0]);
    expect(afterIndividualTransfer1.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);
    const afterIndividualTransfer2 = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[1]);
    expect(afterIndividualTransfer2.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);

    // Check that command handler sends event to domain handler
    const hasSDKOutboundBulkAcceptPartyInfoProcessed = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAcceptPartyInfoProcessedDmEvt'));
    expect(hasSDKOutboundBulkAcceptPartyInfoProcessed).toBeTruthy();

    // Simulate domain handler sending command event for bulk party info request completed
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
    const bulkBatchIds = await bulkTransactionEntityRepo.getAllBulkBatchIds(bulkTransactionId);
    expect(bulkBatchIds[0]).toBeDefined();

    const preBulkBatch = await bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, bulkBatchIds[0]);
    console.log(preBulkBatch);
    expect(bulkBatchIds[1]).toBeDefined();
  });
});