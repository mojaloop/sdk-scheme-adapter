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
 - Sridevi Miriyala <sridevi.miriyala@modusbox.com
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';

import { CommandEvent, ICommandEventData, DomainEvent,
         KafkaCommandEventProducer, IKafkaEventProducerOptions, KafkaDomainEventConsumer, IKafkaEventConsumerOptions,
         ProcessSDKOutboundBulkRequestCmdEvt,
         ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt,
         ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
         ProcessPartyInfoCallbackCmdEvt,
         IProcessSDKOutboundBulkRequestCmdEvtData,
         IProcessPartyInfoCallbackCmdEvtData,
         IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
         IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData,
         RedisBulkTransactionStateRepo,
         IRedisBulkTransactionStateRepoOptions,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { randomUUID } from "crypto";

jest.setTimeout(20000);

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

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

  // TESTS FOR PARTY LOOKUP

  test("1. When inbound command event ProcessSDKOutboundBulkRequest is received \
        Then outbound event SDKOutboundBulkPartyInfoRequested should be published \
          And Global state should be updated to RECEIVED.", async () => {

    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
          skipPartyLookup: true,
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
                partyIdentifier: "16135551212",
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
                partyIdentifier: "16135551212",
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

    await new Promise(resolve => setTimeout(resolve, 5000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('RECEIVED');

    // Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    expect(individualTransfers.length).toBe(2);
    expect((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0])).state).toBe('RECEIVED');
    expect((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[1])).state).toBe('RECEIVED');

    // Check domain events published to kafka
    expect(domainEvents[0].getName()).toBe('SDKOutboundBulkPartyInfoRequestedDmEvt')
    // TODO Add asserts to check data contents of the domain event published to kafka

  });

  test.only("2. Given Party info does not already exist for none of the individual transfers. \
          And Party Lookup is not skipped \
        When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received\
        Then the global state should be updated to DISCOVERY_PROCESSING \
          And PartyInfoRequested kafka event should be published for each individual transfer. \
          And State for individual transfer should be updated to DISCOVERY_PROCESSING.", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, 5000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_PROCESSING');

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    expect(individualTransfers.length).toBe(2);
    expect((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_PROCESSING');
    expect((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[1])).state).toBe('DISCOVERY_PROCESSING');

    // Check number of transfers to be looked up have been saved in Redis
    expect(await bulkTransactionEntityRepo.getPartyLookupTotalCount(bulkTransactionId)).toEqual(individualTransfers.length)

    // Check counts have been initialized
    expect(await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)).toEqual(0)
    expect(await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)).toEqual(0)

    // Check domain events published to kafka
    const filteredEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');
    expect(filteredEvents.length).toBe(2);

    // Check the data contents for domain event
    expect(filteredEvents[0].getName()).toBe('PartyInfoRequestedDmEvt');
    expect(JSON.parse(JSON.stringify(filteredEvents[0].getContent())).path).not.toContain('undefined');
    expect(filteredEvents[1].getName()).toBe('PartyInfoRequestedDmEvt');
    expect(JSON.parse(JSON.stringify(filteredEvents[1].getContent())).path).not.toContain('undefined');


  });

  test("3. Given Party info exists for individual transfers. \
              And Party Lookup is not skipped \
            When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received \
            Then the global state should be updated to DISCOVERY_PROCESSING. \
              And PartyInfoRequested outbound event should not be published for each individual transfer. \
              And State for individual transfer should be updated to DISCOVERY_SUCCESS.", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
                partyIdentifier: "16135551212",
                fspId: "receiverfsp"
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, 5000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_PROCESSING');

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    expect(individualTransfers.length).toBe(1);
    expect((await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0])).state).toBe('DISCOVERY_SUCCESS');

    // Check number of transfers to be looked up have been saved in Redis
    expect(await bulkTransactionEntityRepo.getPartyLookupTotalCount(bulkTransactionId)).toEqual(individualTransfers.length)

    // Check counts have been initialized
    expect(await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)).toEqual(0)
    expect(await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)).toEqual(0)

    const filteredEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');
    // Check domain events published to kafka
    expect(filteredEvents.length).toBe(0)
    //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test("4. Given receiving party info does not exist \
              And receiving party lookup was successful \
            When inbound command event ProcessPartyInfoCallback is received \
            Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
              And the data in redis for individual transfer should be updated with received party info \
              And outbound event PartyInfoCallbackProcessed event should be published", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, 5000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');

    const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: partyInfoRequestedDomainEvents[0].getKey(),
      content: {
        transferId: randomUUID(),
        partyResult: {
          party: {
              partyIdInfo: {
                  partyIdType: 'MSISDN',
                  partyIdentifier: '123456',
                  fspId: 'receiverfsp'
              }
          },
          currentState: 'COMPLETED'
        }
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
    const previousPartyLookupSuccessCount = await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the state of individual transfers in bulk to be RECEIVED
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

    // // Check domain events published to kafka
    expect(domainEvents[2].getName()).toBe('PartyInfoCallbackProcessedDmEvt');
    // //TODO Add asserts to check data contents of the domain event published to kafka
  });

  test("5. Given receiving party info does not exist \
              And receiving party lookup was not successful \
            When inbound command event ProcessPartyInfoCallback is received \
            Then the state for individual successful party lookups should be updated to DISCOVERY_FAILED \
              And outbound event PartyInfoCallbackProcessed event should be published", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    const bulkPartyInfoRequestCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const bulkPartyInfoRequestCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCmdEvt(bulkPartyInfoRequestCommandEventData);
    await producer.sendCommandEvent(bulkPartyInfoRequestCommandEventObj);

    await new Promise(resolve => setTimeout(resolve, 5000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');

    const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: partyInfoRequestedDomainEvents[0].getKey(),
      content: {
        transferId: randomUUID(),
        partyResult: {
          party: {
            partyIdInfo: {
              partyIdType: 'MSISDN',
              partyIdentifier: '123456'
            }
          },
          errorInformation: {
            errorCode: '12345',
            errorDescription: 'ID Not Found'
          },
          currentState: "COMPLETED"
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
    const previousPartyLookupFailedCount = await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)

    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    const individualTransferData = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0]);
    console.log('individualTransferData:', individualTransferData);
    expect(individualTransferData.state).toBe('DISCOVERY_FAILED');
    expect(individualTransferData.partyResponse?.errorInformation?.errorCode).toBe('12345');
    expect(individualTransferData.partyResponse?.errorInformation?.errorDescription).toBe('ID Not Found');

    // Check number of transfers to be looked up have been saved in Redis
    expect(await bulkTransactionEntityRepo.getPartyLookupTotalCount(bulkTransactionId)).toEqual(individualTransfers.length)

    // Check counts have been updated
    expect(await bulkTransactionEntityRepo.getPartyLookupSuccessCount(bulkTransactionId)).toEqual(0)
    expect(await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)).toEqual(1)

    // Check that the party lookup failed count has been incremented
    const followingPartyLookupFailedCount = await bulkTransactionEntityRepo.getPartyLookupFailedCount(bulkTransactionId)
    expect(followingPartyLookupFailedCount).toBe(previousPartyLookupFailedCount + 1);

    // // Check domain events published to kafka
    expect(domainEvents[2].getName()).toBe('PartyInfoCallbackProcessedDmEvt')
  });

  test("6. When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
          Then the global state should be updated to DISCOVERY_COMPLETED", async () => {

    //Publish this message so that it is stored internally in redis
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

  });

  test("7. Given autoAcceptParty setting is set to false \
                When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then outbound event SDKOutboundBulkAcceptPartyInfoRequested should be published \
                  And Then global state should be updated to DISCOVERY_ACCEPTANCE_PENDING", async () => {

    //Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_ACCEPTANCE_PENDING');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();
  });

  test("8. Given autoAcceptParty setting is set to true \
            When Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
                Then outbound event SDKOutboundBulkAutoAcceptPartyInfoRequested should be published. \
              And Then global state should be same as before DISCOVERY_COMPLETED", async () => {
    //Publish this message so that it is stored internally in redis
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();
  });

  test.skip("9. Given inbound command event ProcessSDKOutboundBulkAcceptPartyInfo is received \
        Then the logic should loop through individual transfer in the bulk request \
          And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
          And update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
          And outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {

      //Publish initial message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.Outbound.V2_0_0.Types.bulkTransactionRequest = {
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
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 5000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_ACCEPTANCE_COMPLETED');

  });

  // // TESTS FOR QUOTE PROCESSING

  // test("When Inbound command event ProcessSDKOutboundBulkQuotesRequest is received\
  //       Then the logic should update the global state to AGREEMENT_PROCESSING, \
  //         And create batches based on FSP that has DISCOVERY_ACCEPTED state \
  //         And also has config maxEntryConfigPerBatch \
  //         And publish BulkQuotesRequested per each batch \
  //         And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
  //   //TODO add asserts
  // });

  // test("Given Inbound command event ProcessBulkQuotesCallback for success requests \
  //        Then the logic should update the individual batch state to AGREEMENT_PROCESSING, \
  //         And create batches based on FSP that has DISCOVERY_ACCEPTED state \
  //        And also has config maxEntryConfigPerBatch \
  //        And publish BulkQuotesRequested per each batch \
  //        And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
  //   //TODO add asserts
  // });
});
