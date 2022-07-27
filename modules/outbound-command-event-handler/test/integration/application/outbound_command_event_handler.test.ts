

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

'use strict'

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import { DomainEventMessage, EventMessageType, OutboundDomainEventMessageName, IDomainEventMessageData } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { KafkaDomainEventProducer } from '@mojaloop/sdk-scheme-adapter-private-shared-lib'

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here
const producer = new KafkaDomainEventProducer(logger)

const sampleDomainEventMessageData: IDomainEventMessageData = {
  key: 'sample-key1',
  name: OutboundDomainEventMessageName.SDKOutboundBulkRequestReceived,
  content: {
    id: '123784627836457823',
    options: {},
    individualTransfers: []
  },
  timestamp: Date.now(),
  headers: []
}

describe('First domain event', () => {
  beforeEach(async () => {
    await producer.init();
  });

  afterEach(async () => {
    await producer.destroy();
  });

  // TESTS FOR PARTY LOOKUP

  test('Inbound event ProcessSDKOutboundBulkRequest should publish outbound SDKOutboundBulkPartyInfoRequested event. Global state should be RECEIVED.', async () => {
    //TODO add asserts

    //TODO question: In sequence diagram it says, break json into smaller parts. What does it mean by smaller parts
  })

  test('Inbound event ProcessSDKOutboundBulkPartyInfoRequest \
        should update global state to DISCOVERY_PROCESSING \
        and Party info does not already exist for none of the individual transfers. \
        So PartyInfoRequested kafka event should be published for each individual transfer. \
        State for individual transfer should be updated to DISCOVERY_PROCESSING.', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkPartyInfoRequest \
        should update global state to DISCOVERY_PROCESSING. \
        Party info exists for individual transfers. \
        PartyInfoRequested event should not be published for each individual transfer. \
        State for individual transfer should be updated to DISCOVERY_SUCCESS.', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessPartyInfoCallback \
        should update the state for individual successful party lookups to DISCOVERY_SUCCESS', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessPartyInfoCallback \
        should update the state for individual failed party lookups to DISCOVERY_FAILED', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete should update the global state to DISCOVERY_COMPLETED', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete should publish event SDKOutboundBulkAcceptpartyInfoRequested and update the global state to DISCOVERY_ACCEPTANCE_PENDING if autoAcceptParty is false', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkPartyInfoRequestComplete should publish event SDKOutboundBulkAutoAcceptpartyInfoRequested if autoAcceptParty is true', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkAcceptPartyInfo should loop through individual transfer in the bulk request and update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event, update the overall global state to DISCOVERY_ACCEPTANCE_COMPLETED and publish event SDKOutboundBulkAcceptPartyInfoProcessed', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessSDKOutboundBulkAcceptPartyInfo should loop through individual transfer in the bulk request and update the individual transfer state to DISCOVERY_ACCEPTED or DISCOVERY_REJECTED based on the value in the incoming event', async () => {
    //TODO add asserts


  })

  // TESTS FOR QUOTE PROCESSING

  test('Inbound event ProcessSDKOutboundBulkQuotesRequest should update the global state to AGREEMENT_PROCESSING, create batches based on FSP that has DISCOVERY_ACCEPTED state and also has config maxEntryConfigPerBatch and publish BulkQuotesRequested per each batch updating its state to AGREEMENT_PROCESSING.', async () => {
    //TODO add asserts


  })

  test('Inbound event ProcessBulkQuotesCallback for success requests should update the individual batch state to AGREEMENT_PROCESSING, create batches based on FSP that has DISCOVERY_ACCEPTED state and also has config maxEntryConfigPerBatch and publish BulkQuotesRequested per each batch updating its state to AGREEMENT_PROCESSING.', async () => {
    //TODO add asserts


  })

})
