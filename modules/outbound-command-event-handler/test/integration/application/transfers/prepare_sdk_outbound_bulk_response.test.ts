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
 - Kevin Leyow <kevin.leyow@infitx.com>
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
  BulkTransactionInternalState,
  IKafkaEventConsumerOptions,
  IKafkaEventProducerOptions,
  IRedisBulkTransactionStateRepoOptions,
  SDKOutboundBulkResponsePreparedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { ProcessHelper, StopAfterEventEnum } from "../../../util/generator";

// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(30000)

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here
const messageTimeout = 2000;

const KAFKA_HOST = 'localhost:9092';
// Setup for Kafka Producer
const commandEventProducerOptions: IKafkaEventProducerOptions = {
    brokerList: KAFKA_HOST,
    clientId: 'test-integration_client_id',
    topic: 'topic-sdk-outbound-command-events'
}

const domainEventProducerOptions: IKafkaEventProducerOptions = {
  brokerList: KAFKA_HOST,
  clientId: 'test-integration_client_id',
  topic: 'topic-sdk-outbound-domain-events'
}

// Setup for Kafka Consumer
const domainEventConsumerOptions: IKafkaEventConsumerOptions = {
  brokerList: 'localhost:9092',
  clientId: 'test-integration_client_id',
  topics: ['topic-sdk-outbound-domain-events'],
  groupId: "domain_events_consumer_client_id"
}

// Setup for Redis access
const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: 'redis://localhost:6379'
}

let processHelper: ProcessHelper;

describe("Tests for PrepareSDKOutboundBulkResponseCmdEvt Command Event", () => {

  beforeEach(async () => {
    processHelper.resetDomainEvents();
  });

  beforeAll(async () => {

    processHelper = new ProcessHelper(
      bulkTransactionEntityRepoOptions,
      domainEventProducerOptions,
      commandEventProducerOptions,
      domainEventConsumerOptions,
      logger
    );

    await processHelper.init();
  });

  afterAll(async () => {
    await processHelper.destroy();
  });

  test("Given the BulkTransaction with Options { \
        synchronous: false, \
        onlyValidateParty: true, \
        skipPartyLookup: false, \
        autoAcceptParty: false, \
        autoAcceptQuote: false \
      } \
      When inbound command event PrepareSDKOutboundBulkResponseCmdEvt is received \
      And SDKOutboundBulkResponsePreparedDmEvt should be published for each transfer batch \
      And the Bulk Transaction global state should be updated to RESPONSE_PROCESSING \
    ",
    async () => {
    // SETUP // ACT
    const result = await processHelper.generate({
      StopAfterEvent: StopAfterEventEnum.PrepareSDKOutboundBulkResponseCmdEvt,
      messageTimeout,
    })

    const bulkTransactionId = processHelper.bulkTransactionRequest.bulkTransactionId;

    // ASSERT
    // Check that command handler published SDKOutboundBulkResponsePrepared message
    const hasSDKOutboundBulkResponsePrepared = (processHelper.domainEvents.find((e) => e.getName() === SDKOutboundBulkResponsePreparedDmEvt.name));
    expect(hasSDKOutboundBulkResponsePrepared).toBeTruthy();

    const bulkStateResponseProcessing = await processHelper.bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateResponseProcessing.state).toBe(BulkTransactionInternalState.RESPONSE_PROCESSING);
  });
});
