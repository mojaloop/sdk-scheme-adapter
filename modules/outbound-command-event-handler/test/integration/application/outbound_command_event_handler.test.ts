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
 - Shashikant Hirugade <shashikant.hirugade@modusbox.com>
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 - Sridevi Miriyala <sridevi.miriyala@modusbox.com
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
  DomainEventMessage,
  EventMessageType,
  OutboundDomainEventMessageName,
  IDomainEventMessageData,
} from "@mojaloop/sdk-scheme-adapter-private-shared-lib";
import { KafkaDomainEventProducer } from "@mojaloop/sdk-scheme-adapter-private-shared-lib";

const logger: ILogger = new DefaultLogger("bc", "appName", "appVersion"); //TODO: parameterize the names here
const producer = new KafkaDomainEventProducer(logger);

const sampleDomainEventMessageData: IDomainEventMessageData = {
  key: "sample-key1",
  name: OutboundDomainEventMessageName.SDKOutboundBulkRequestReceived,
  content: {
    id: "123784627836457823",
    options: {},
    individualTransfers: [],
  },
  timestamp: Date.now(),
  headers: [],
};

describe("First domain event", () => {
  beforeEach(async () => {
    await producer.init();
  });

  afterEach(async () => {
    await producer.destroy();
  });

  // TESTS FOR PARTY LOOKUP

  test("When inbound command event ProcessSDKOutboundBulkRequest is received \
        Then outbound event SDKOutboundBulkPartyInfoRequested should be published \
        And Then Global state should be updated to RECEIVED.", async () => {
    //TODO add asserts
    //TODO question: In sequence diagram it says, break json into smaller parts. What does it mean by smaller parts
    const inboundCommandEvent = getInboundCommandEvent()

    const outboundEvent = getOutboundKafkaEvent()
    const outboundEventHeaders = outboundEvent.getHeaders()
    const outboundEventMessage = outboundEvent.getData()
    expect(outboundEventMessage.name).toBe('SDKOutboundBulkPartyInfoRequested')

    const redisData = getGlobalDataFromRedis('bulkTransactionId')
    expect(redisData.status).toBe('RECEIVED')

  });

  test("When inbound event ProcessSDKOutboundBulkPartyInfoRequest is received\
        And When Party info does not already exist for none of the individual transfers. \
        Then the global state should be updated to DISCOVERY_PROCESSING \
        And Then PartyInfoRequested kafka event should be published for each individual transfer. \
        And Then State for individual transfer should be updated to DISCOVERY_PROCESSING.", async () => {
    //TODO add asserts
  });

  test("When inbound event ProcessSDKOutboundBulkPartyInfoRequest is received \
        And When Party info exists for individual transfers. \
        Then the global state should be updated to DISCOVERY_PROCESSING. \
        
        PartyInfoRequested event should not be published for each individual transfer. \
        State for individual transfer should be updated to DISCOVERY_SUCCESS.", async () => {
    //TODO add asserts
  });

  test("When inbound event ProcessPartyInfoCallback is received \
        Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS", async () => {
    //TODO add asserts
  });

  test("When inbound event ProcessPartyInfoCallback is received\
        Then state for individual failed party lookups should be updated to DISCOVERY_FAILED", async () => {
    //TODO add asserts
  });

  test("When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then the global state should be updated to DISCOVERY_COMPLETED", async () => {
    //TODO add asserts
  });

  test("Given autoAcceptParty setting is set to false \
        When inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then outbound event SDKOutboundBulkAcceptpartyInfoRequested should be published \
        And Then global state should be updated to DISCOVERY_ACCEPTANCE_PENDING", async () => {
    //TODO add asserts



  });

  test("Given autoAcceptParty setting is set to true \
        When Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete is received \
        Then outbound event SDKOutboundBulkAutoAcceptpartyInfoRequested should be published.", async () => {
    //TODO add asserts
  });

  test("Given inbound command event ProcessSDKOutboundBulkAcceptPartyInfo is received \
        Then the logic should loop through individual transfer in the bulk request \
        And Then update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
        And Then update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
        And Then outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {
    //TODO add asserts
  });

  test("Inbound event ProcessSDKOutboundBulkAcceptPartyInfo should loop through individual transfer in the bulk request and update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event", async () => {
    //TODO add asserts
  });

  // TESTS FOR QUOTE PROCESSING

  test("Inbound event ProcessSDKOutboundBulkQuotesRequest should update the global state to AGREEMENT_PROCESSING, create batches based on FSP that has DISCOVERY_ACCEPTED state and also has config maxEntryConfigPerBatch and publish BulkQuotesRequested per each batch updating its state to AGREEMENT_PROCESSING.", async () => {
    //TODO add asserts
  });

  test("Inbound event ProcessBulkQuotesCallback for success requests should update the individual batch state to AGREEMENT_PROCESSING, create batches based on FSP that has DISCOVERY_ACCEPTED state and also has config maxEntryConfigPerBatch and publish BulkQuotesRequested per each batch updating its state to AGREEMENT_PROCESSING.", async () => {
    //TODO add asserts
  });
});
