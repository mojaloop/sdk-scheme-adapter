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
 - Sridevi Miriyala <sridevi.miriyala@modusbox.com
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

import {
    DomainEvent,
    IKafkaEventConsumerOptions,
    IKafkaEventProducerOptions,
    IProcessPartyInfoCallbackCmdEvtData,
    IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
    IProcessSDKOutboundBulkRequestCmdEvtData,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    KafkaDomainEventConsumer,
    ProcessPartyInfoCallbackCmdEvt,
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
    ProcessSDKOutboundBulkRequestCmdEvt,
    RedisBulkTransactionStateRepo,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { randomUUID } from "crypto";

// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(10000)

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
const _messageHandler = async (message: DomainEvent): Promise<void> => {
  console.log('Domain Message: ', message);
  domainEvents.push(message);
}
const consumer = new KafkaDomainEventConsumer(_messageHandler.bind(this), domainEventConsumerOptions, logger)

// Setup for Redis access
const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: 'redis://localhost:6379'
}
const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);


describe("Tests for discovery part in Outbound Command Event Handler", () => {

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

  // TESTS FOR PARTY LOOKUP

  test("Given receiving party info does not exist \
      And receiving party lookup was successful \
      When inbound command event ProcessPartyInfoCallback is received \
      Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
      And the data in redis for individual transfer should be updated with received party info \
      And outbound event PartyInfoCallbackProcessed event should be published \
      And if all lookups are incomplete, outbound event ProcessSDKOutboundBulkPartyInfoRequestProcessed should not be published \
      And neither outbound event SDKOutboundBulkAutoAcceptPartyInfoRequested/SDKOutboundBulkAutoAcceptPartyInfoRequested should be published", async () => {
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
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, messageTimeout));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    // ACT
    // Get the randomly generated transferIds for the callback
    const randomGeneratedTransferIds = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // The transfer ids are unordered so using the transfer amounts to identify each transfer
    // so we can reference the proper transferId in subsequent callbacks
    const amountList: string[] = []
    amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[0])).request.amount)
    amountList.push((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[1])).request.amount)

    // Only publish party info callback for one lookup
    const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
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
    const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
    const previousPartyLookupSuccessCount = await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // ASSERT
    // Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    const individualTransferData = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, randomGeneratedTransferIds[amountList.indexOf('1')]);
    console.log('individualTransferData:', individualTransferData);
    expect(individualTransferData.state).toBe('DISCOVERY_SUCCESS');
    expect(individualTransferData.partyResponse?.party.partyIdInfo.fspId).toBe('receiverfsp');

    // Check number of transfers to be looked up have been saved in Redis
    expect(await bulkTransactionEntityRepo.getPartyLookupTotalCount(bulkTransactionId)).toEqual(individualTransfers.length)

    // Check counts have been updated
    expect(await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)).toEqual(1)
    expect(await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)).toEqual(0)

    // Check that the party lookup success count has been incremented
    const followingPartyLookupSuccessCount = await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId);
    expect(followingPartyLookupSuccessCount).toBe(previousPartyLookupSuccessCount! + 1);

    // Check domain events published to kafka
    const partyInfoCallbackProcessedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoCallbackProcessedDmEvt');
    expect(partyInfoCallbackProcessedDmEvts.length).toEqual(1);

    const SDKOutboundBulkPartyInfoRequestProcessedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'SDKOutboundBulkPartyInfoRequestProcessedDmEvt');
    expect(SDKOutboundBulkPartyInfoRequestProcessedDmEvts.length).toEqual(0);

    const SDKOutboundBulkAcceptPartyInfoRequestedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'SDKOutboundBulkAcceptPartyInfoRequestedDmEvt');
    expect(SDKOutboundBulkAcceptPartyInfoRequestedDmEvts.length).toEqual(0);

    // //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test("Given receiving party info does not exist \
        And receiving party lookup was successful \
        When inbound command event ProcessPartyInfoCallback is received \
        Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
        And the data in redis for individual transfer should be updated with received party info \
        And outbound event PartyInfoCallbackProcessed event should be published \
        And if all lookups are complete, outbound event ProcessSDKOutboundBulkPartyInfoRequestProcessed should be published \
        And if auto accept party is false, outbound event SDKOutboundBulkAcceptPartyInfoRequested should be published", async () => {
    // SETUP
    // Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
      bulkHomeTransactionID: "string",
      bulkTransactionId: bulkTransactionId,
      options: {
        onlyValidateParty: true,
        autoAcceptParty: {
          enabled: false
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
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, messageTimeout));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    // ACT
    // Get the randomly generated transferId for the callback
    const previousIndividualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: previousIndividualTransfers[0],
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
    const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
    const previousPartyLookupSuccessCount = await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // ASSERT
    // Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    const individualTransferData = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0]);
    console.log('individualTransferData:', individualTransferData);
    expect(individualTransferData.state).toBe('DISCOVERY_SUCCESS');
    expect(individualTransferData.partyResponse?.party.partyIdInfo.fspId).toBe('receiverfsp');

    // Check number of transfers to be looked up have been saved in Redis
    expect(await bulkTransactionEntityRepo.getPartyLookupTotalCount(bulkTransactionId)).toEqual(individualTransfers.length)

    // Check counts have been updated
    expect(await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)).toEqual(1)
    expect(await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)).toEqual(0)

    // Check that the party lookup success count has been incremented
    const followingPartyLookupSuccessCount = await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId);
    expect(followingPartyLookupSuccessCount).toBe(previousPartyLookupSuccessCount! + 1);

    // Check domain events published to kafka
    const partyInfoCallbackProcessedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoCallbackProcessedDmEvt');
    expect(partyInfoCallbackProcessedDmEvts.length).toEqual(1);

    const SDKOutboundBulkPartyInfoRequestProcessedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'SDKOutboundBulkPartyInfoRequestProcessedDmEvt');
    expect(SDKOutboundBulkPartyInfoRequestProcessedDmEvts.length).toEqual(1);

    const SDKOutboundBulkAcceptPartyInfoRequestedDmEvts = domainEvents.filter(domainEvent => domainEvent.getName() === 'SDKOutboundBulkAcceptPartyInfoRequestedDmEvt');
    expect(SDKOutboundBulkAcceptPartyInfoRequestedDmEvts.length).toEqual(1);

    // //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test.skip("Given receiving party info does not exist \
        And receiving party lookup was successful \
        When inbound command event ProcessPartyInfoCallback is received \
        Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
        And the data in redis for individual transfer should be updated with received party info \
        And outbound event PartyInfoCallbackProcessed event should be published \
        And if all lookups are complete, outbound event ProcessSDKOutboundBulkPartyInfoRequestProcessed should be published \
        And if auto accept party is true, outbound event SDKOutboundBulkAutoAcceptPartyInfoRequested should be published", async () => {
  });
  // test("5. Given receiving party info does not exist \
  //             And receiving party lookup was not successful \
  //           When inbound command event ProcessPartyInfoCallback is received \
  //           Then the state for individual successful party lookups should be updated to DISCOVERY_FAILED \
  //             And outbound event PartyInfoCallbackProcessed event should be published", async () => {

  //   //Publish this message so that it is stored internally in redis
  //   const bulkTransactionId = randomUUID();
  //   const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
  //       bulkHomeTransactionID: "string",
  //       bulkTransactionId: bulkTransactionId,
  //       options: {
  //         onlyValidateParty: true,
  //         autoAcceptParty: {
  //           enabled: false
  //         },
  //         autoAcceptQuote: {
  //           enabled: true,
  //         },
  //         skipPartyLookup: false,
  //         synchronous: true,
  //         bulkExpiration: "2016-05-24T08:38:08.699-04:00"
  //       },
  //       from: {
  //         partyIdInfo: {
  //           partyIdType: "MSISDN",
  //           partyIdentifier: "16135551212",
  //           fspId: "string",
  //         },
  //       },
  //       individualTransfers: [
  //         {
  //           homeTransactionId: randomUUID(),
  //           to: {
  //             partyIdInfo: {
  //               partyIdType: "MSISDN",
  //               partyIdentifier: "16135551212"
  //             },
  //           },
  //           amountType: "SEND",
  //           currency: "USD",
  //           amount: "123.45",
  //         }
  //       ]
  //   }
  //   const sampleCommandEventData: IProcessSDKOutboundBulkRequestCmdEvtData = {
  //     bulkRequest,
  //     timestamp: Date.now(),
  //     headers: []
  //   }
  //   const processSDKOutboundBulkRequestMessageObj = new ProcessSDKOutboundBulkRequestCmdEvt(sampleCommandEventData);
  //   await producer.sendCommandEvent(processSDKOutboundBulkRequestMessageObj);
  //   await new Promise(resolve => setTimeout(resolve, 1000));

  //   const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
  //     bulkId: bulkTransactionId,
  //     timestamp: Date.now(),
  //     headers: []
  //   }
  //   const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
  //   await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   // Check the state in Redis
  //   console.log('bulk id: ', bulkTransactionId);

  //   const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');

  //   const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
  //     bulkId: bulkTransactionId,
  //     content: {
  //         transferId: partyInfoRequestedDomainEvents[0].getKey(),
  //         partyResult: {
  //           errorInformation: {
  //             errorCode: '12345',
  //             errorDescription: 'ID Not Found'
  //           },
  //           currentState: 'ERROR_OCCURRED'
  //         },
  //     },
  //     timestamp: Date.now(),
  //     headers: []
  //   }

  //   const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
  //   await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
  //   await new Promise(resolve => setTimeout(resolve, 1000));

  //   //Check that the state of individual transfers in bulk to be RECEIVED
  //   const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
  //   const individualTransferData = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0]);
  //   console.log('individualTransferData:', individualTransferData);
  //   expect(individualTransferData.state).toBe('DISCOVERY_FAILED');
  //   expect(individualTransferData.partyResponse?.errorInformation?.errorCode).toBe('12345');
  //   expect(individualTransferData.partyResponse?.errorInformation?.errorDescription).toBe('ID Not Found');

  //   // // Check domain events published to kafka
  //   expect(domainEvents[2].getName()).toBe('PartyInfoCallbackProcessedDmEvt')
  // });


});
