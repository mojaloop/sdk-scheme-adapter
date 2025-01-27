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

 --------------
 ******/
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
   IProcessSDKOutboundBulkRequestCmdEvtData,
   IRedisBulkTransactionStateRepoOptions,
   KafkaCommandEventProducer,
   KafkaDomainEventConsumer,
   ProcessSDKOutboundBulkRequestCmdEvt,
   RedisBulkTransactionStateRepo,
 } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
 import { randomUUID } from "crypto";

 // Tests can timeout in a CI pipeline so giving it leeway
 jest.setTimeout(10000)

 const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here
 const messageTimeout = 5000;

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
   test.only("1. When inbound command event ProcessSDKOutboundBulkRequest is received \
          Then outbound event SDKOutboundBulkPartyInfoRequested should be published \
            And Global state should be updated to RECEIVED.", async () => {

     const bulkTransactionId = randomUUID();
     const bulkRequest: SDKSchemeAdapter.V2_0_0.Outbound.Types.bulkTransactionRequest = {
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

     await new Promise(resolve => setTimeout(resolve, messageTimeout));
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
});
