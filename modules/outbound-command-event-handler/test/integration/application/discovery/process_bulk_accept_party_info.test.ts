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
    IndividualTransferInternalState,
    IProcessPartyInfoCallbackCmdEvtData,
    IProcessSDKOutboundBulkAcceptPartyInfoCmdEvtData,
    IProcessSDKOutboundBulkPartyInfoRequestCmdEvtData,
    IProcessSDKOutboundBulkRequestCmdEvtData,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    KafkaDomainEventConsumer,
    ProcessPartyInfoCallbackCmdEvt,
    ProcessSDKOutboundBulkAcceptPartyInfoCmdEvt,
    ProcessSDKOutboundBulkPartyInfoRequestCmdEvt,
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


describe("Tests for ProcessSDKOutboundBulkAcceptPartyInfo Event Handler", () => {

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

  test("Given inbound command event ProcessSDKOutboundBulkAcceptPartyInfo is received \
        Then the logic should loop through individual transfer in the bulk request \
        And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
        And update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
        And outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {
    // Publish this message so that it is stored internally in redis
    const bulkTransactionId = randomUUID();
    const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
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

    const processPartyInfoCallbackMessageObjOne = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData1);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObjOne);
    const processPartyInfoCallbackMessageObjTwo = new ProcessPartyInfoCallbackCmdEvt(processPartyInfoCallbackMessageData2);
    await producer.sendCommandEvent(processPartyInfoCallbackMessageObjTwo);
    await new Promise(resolve => setTimeout(resolve, messageTimeout));

    // Command event for sdk outbound bulk accept party info request
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
            acceptParty: false
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

    // Check that accepted party for individual transfers have been updated to DISCOVERY_ACCEPTED
    const acceptedIndividualTransfer = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[amountList.indexOf('1')]);
    expect(acceptedIndividualTransfer.state).toBe(IndividualTransferInternalState.DISCOVERY_ACCEPTED);

    // Check that rejected party for individual transfers have been updated to DISCOVERY_REJECTED
    const rejectedIndividualTransfer = await bulkTransactionEntityRepo.getIndividualTransfer(bulkTransactionId,  randomGeneratedTransferIds[amountList.indexOf('2')]);
    expect(rejectedIndividualTransfer.state).toBe(IndividualTransferInternalState.DISCOVERY_REJECTED);

     // Check that command handler sends event to domain handler
    const hasSDKOutboundBulkAcceptPartyInfoProcessed = (domainEvents.find((e) => e.getName() === 'SDKOutboundBulkAcceptPartyInfoProcessedDmEvt'));
    expect(hasSDKOutboundBulkAcceptPartyInfoProcessed).toBeTruthy();
  });
});
