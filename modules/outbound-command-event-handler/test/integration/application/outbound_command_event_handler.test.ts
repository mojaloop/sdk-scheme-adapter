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
          And Global state should be updated to RECEIVED.", async () => {

    const inboundBulkRequestOptions = {
      count: 1,
      sender: {
        idType: 'MSISDN',
        id: 5719891907,

      },
      receivers: [{
        receiver: {
          idType: 'MSISDN',
          to: 5719891908,
          currency: 'USD',
          amount: 10
        }
      }]
    }
    const inboundCommandEvent = getInboundCommandEvent(inboundBulkRequestOptions)
    submitInboundCommandEvent(inboundCommandEvent, 'ProcessSDKOutboundBulkRequest')
    const outboundEvents = getOutboundKafkaEvents()
    const outboundEventHeaders = outboundEvent[0].getHeaders()
    const outboundEventMessage = outboundEvent[0].getData()
    expect(outboundEventMessage.name).toBe('SDKOutboundBulkPartyInfoRequested')

    const redisData = getGlobalDataFromRedis('bulkTransactionId')
    expect(redisData.status).toBe('RECEIVED')

  });

  test("Given Party info does not already exist for none of the individual transfers. \
        When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received\
        Then the global state should be updated to DISCOVERY_PROCESSING \
          And PartyInfoRequested kafka event should be published for each individual transfer. \
          And State for individual transfer should be updated to DISCOVERY_PROCESSING.", async () => {

    const inboundBulkRequestOptions = {
      count: 1,
      sender: {
        idType: 'MSISDN',
        id: 5719891907,

      },
      receivers: [
        {
          idType: 'MSISDN',
          to: 5719891908,
          currency: 'USD',
          amount: 10
        },
        {
          idType: 'MSISDN',
          to: 5719891909,
          currency: 'USD',
          amount: 20
        }
      ]
    }
    const inboundCommandEvent = getInboundCommandEvent(inboundBulkRequestOptions, 'ProcessSDKOutboundBulkPartyInfoRequest')
    submitInboundCommandEvent(inboundCommandEvent)
    const redisData = getGlobalDataFromRedis('bulkTransactionId')
    expect(redisData.state).toBe('DISCOVERY_PROCESSING')

    const outboundEvents = getOutboundKafkaEvents()
    expect(outboundEvents.size()).toBe(2)

    const outboundEvent1Headers = outboundEvent[0].getHeaders()
    const outboundEvent1Message = outboundEvent[0].getData()
    expect(outboundEvent1Message.receiverId).toBe(5719891908)
    expect(outboundEvent1Message.name).toBe('PartyInfoRequested')
    const redis1Data = getDataFromRedis(outboundEvent1Message.transferId)
    expect(redis1Data.state).toBe('DISCOVERY_PROCESSING')

    const outboundEvent2Headers = outboundEvent[1].getHeaders()
    const outboundEvent2Message = outboundEvent[1].getData()
    expect(outboundEvent2Message.receiverId).toBe(5719891909)
    expect(outboundEvent2Message.name).toBe('PartyInfoRequested')
    const redis2Data = getDataFromRedis(outboundEvent2Message.transferId)
    expect(redis2Data.state).toBe('DISCOVERY_PROCESSING')

  });

  test("Given Party info exists for individual transfers. \
        When inbound command event ProcessSDKOutboundBulkPartyInfoRequest is received \
        Then the global state should be updated to DISCOVERY_PROCESSING. \
          And PartyInfoRequested outbound event should not be published for each individual transfer. \
          And State for individual transfer should be updated to DISCOVERY_SUCCESS.", async () => {
    
    // Store party details for 5719891910 in redis.

    const inboundBulkRequestOptions = {
      count: 1,
      sender: {
        idType: 'MSISDN',
        id: 5719891907,

      },
      receivers: [{
        receiver: {
          idType: 'MSISDN',
          to: 5719891910,
          currency: 'USD',
          amount: 10
        }
      }]
    }
    const inboundCommandEvent = getInboundCommandEvent(inboundBulkRequestOptions)
    submitInboundCommandEvent(inboundCommandEvent, 'ProcessSDKOutboundBulkRequest')
    const outboundEvents = getOutboundKafkaEvents()
    expect(outboundEvents.size()).toBe(0)
    
    const redis1Data = getDataFromRedis(inboundCommandEvent.data.individualTransfers[0].transferId)
    expect(redis1Data.state).toBe('DISCOVERY_SUCCESS')
  });

  test("Given party lookup was successful \
        When inbound command event ProcessPartyInfoCallback is received \
        Then the state for individual successful party lookups should be updated to DISCOVERY_SUCCESS \
        And outbound event PartyInfoCallbackProcessed event should be published", async () => {
    
    const inboundCommandEvent = getInboundCommandEvent(inboundBulkRequestOptions)
    submitInboundCommandEvent(inboundCommandEvent, 'ProcessPartyInfoCallback')

    const outboundEvents = getOutboundKafkaEvents()
    expect(outboundEvents.size()).toBe(1)
    expect(outboundEvents[0].name).toBe('PartyInfoCallbackProcessed')
    
    const redis1Data = getDataFromRedis(inboundCommandEvent.data.individualTransfers[0].transferId)
    expect(redis1Data.state).toBe('DISCOVERY_SUCCESS')
  });

  test("Given party lookup was a failure \
        When inbound event ProcessPartyInfoCallback is received\
        Then state for individual failed party lookups should be updated to DISCOVERY_FAILED \
        And outbound event PartyInfoCallbackProcessed event should be published", async () => {
    
    const inboundCommandEvent = getInboundCommandEvent(inboundBulkRequestOptions)
    submitInboundCommandEvent(inboundCommandEvent, 'ProcessPartyInfoCallback')

    const outboundEvents = getOutboundKafkaEvents()
    expect(outboundEvents.size()).toBe(1)
    expect(outboundEvents[0].name).toBe('PartyInfoCallbackProcessed')
    
    const redis1Data = getDataFromRedis(inboundCommandEvent.data.individualTransfers[0].transferId)
    expect(redis1Data.state).toBe('DISCOVERY_FAILED')
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
          And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event \
          And update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED \
          And outbound event SDKOutboundBulkAcceptPartyInfoProcessed should be published", async () => {
    //TODO add asserts
  });

  test("Given Inbound command event ProcessSDKOutboundBulkAcceptPartyInfo \
        Then the logic should loop through individual transfer in the bulk request \
          And update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event", async () => {
    //TODO add asserts
  });

  // TESTS FOR QUOTE PROCESSING

  test("When Inbound command event ProcessSDKOutboundBulkQuotesRequest is received\
        Then the logic should update the global state to AGREEMENT_PROCESSING, \
          And create batches based on FSP that has DISCOVERY_ACCEPTED state \
          And also has config maxEntryConfigPerBatch \
          And publish BulkQuotesRequested per each batch \
          And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
    //TODO add asserts
  });

  test("Given Inbound command event ProcessBulkQuotesCallback for success requests \
         Then the logic should update the individual batch state to AGREEMENT_PROCESSING, \
          And create batches based on FSP that has DISCOVERY_ACCEPTED state \
         And also has config maxEntryConfigPerBatch \
         And publish BulkQuotesRequested per each batch \
         And update the state of each batch to AGREEMENT_PROCESSING.", async () => {
    //TODO add asserts
  });
});
