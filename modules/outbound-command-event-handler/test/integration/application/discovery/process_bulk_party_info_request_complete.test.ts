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
 
 import {
   DomainEvent,
   IKafkaEventConsumerOptions,
   IKafkaEventProducerOptions,
   IProcessPartyInfoCallbackCmdEvtData,
   IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
   IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData,
   IProcessSDKOutboundBulkRequestCmdEvtData,
   IRedisBulkTransactionStateRepoOptions,
   KafkaCommandEventProducer,
   KafkaDomainEventConsumer,
   ProcessPartyInfoCallbackCmdEvt,
   ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
   ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt,
   ProcessSDKOutboundBulkRequestCmdEvt,
   RedisBulkTransactionStateRepo,
 } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Check the state in Redis
    console.log('bulk id: ', bulkTransactionId);

    // Get the randomly generated transferId for the callback
    const previousIndividualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    const partyInfoRequestedDomainEvents = domainEvents.filter(domainEvent => domainEvent.getName() === 'PartyInfoRequestedDmEvt');
    const processPartyInfoCallbackMessageData: IProcessPartyInfoCallbackCmdEvtData = {
      bulkId: bulkTransactionId,
      content: {
        transferId: partyInfoRequestedDomainEvents[0].getKey(),
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
          currentState: 'ERROR_OCCURRED'
        },
      },
      timestamp: Date.now(),
      headers: []
    }
    const processPartyInfoCallbackMessageObj = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    //Check that the state of individual transfers in bulk to be RECEIVED
    const individualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);
    const individualTransferData = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId, individualTransfers[0]);
    console.log('individualTransferData:', individualTransferData);
    expect(individualTransferData.state).toBe('DISCOVERY_FAILED');
    expect(individualTransferData.partyResponse?.errorInformation?.errorCode).toBe('12345');
    expect(individualTransferData.partyResponse?.errorInformation?.errorDescription).toBe('ID Not Found');

    // // Check domain events published to kafka
    expect(domainEvents[2].getName()).toBe('PartyInfoCallbackProcessedDmEvt')
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

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
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData: IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, 1000));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();
  });

});