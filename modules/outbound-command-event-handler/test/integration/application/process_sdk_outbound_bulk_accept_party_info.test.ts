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

  test("9. Given inbound command event ProcessSDKOutboundBulkAcceptPartyInfo is received \
        Then the logic should loop through individual transfer in the bulk request \
        And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
        And update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
        And outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {
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
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Command event for bulk party info request completed
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData : IProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvtData = {
      bulkId: bulkTransactionId,
      timestamp: Date.now(),
      headers: []
    }
    const processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj = new ProcessSDKOutboundBulkPartyInfoRequestCompleteCmdEvt(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventData);
    await producer.sendCommandEvent(processSDKOutboundBulkPartyInfoRequestCompleteCommandEventObj);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkState = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkState.state).toBe('DISCOVERY_COMPLETED');

    // Check domain events published to kafka
    const hasAcceptPartyEvent = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAutoAcceptPartyInfoRequestedDmEvt'));
    expect(hasAcceptPartyEvent).toBeTruthy();

    // Get the randomly generated transferId for the callback
    const previousIndividualTransfers = await bulkTransactionEntityRepo.getAllIndividualTransferIds(bulkTransactionId);

    // Command event for bulk party info request completed
    const processSDKOutboundBulkAcceptPartyInfoCommandEventData : IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        bulkHomeTransactionID: 'string',
        individualTransfers: [
          {
            homeTransactionId: 'string',
            transactionId: previousIndividualTransfers[0],
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

    //Check that the global state of individual transfers in bulk to be RECEIVED
    const bulkStateTwo = await bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateTwo.state).toBe(BulkTransactionInternalState.DISCOVERY_ACCEPTANCE_COMPLETED);

    // Get the randomly generated transferId for the callback
    const afterIndividualTransfer = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  previousIndividualTransfers[0]);
    expect(afterIndividualTransfer.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);

    // Check domain events published to kafka
    console.log(domainEvents)
    const hasSDKOutboundBulkAcceptPartyInfoProcessed = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAcceptPartyInfoProcessedDmEvt'));
    expect(hasSDKOutboundBulkAcceptPartyInfoProcessed).toBeTruthy();

  });
});
