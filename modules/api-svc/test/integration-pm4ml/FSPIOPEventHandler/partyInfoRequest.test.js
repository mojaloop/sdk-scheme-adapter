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
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com
 --------------
 ******/

 "use strict";

const { DefaultLogger } = require('@mojaloop/logging-bc-client-lib');
const {
  KafkaDomainEventConsumer,
  KafkaDomainEventProducer,
  PartyInfoRequestedDmEvt,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const axios = require('axios');
jest.unmock('@mojaloop/sdk-scheme-adapter-private-shared-lib');
jest.unmock('@mojaloop/sdk-standard-components');
jest.unmock('redis');
jest.unmock('@mojaloop/central-services-shared');
jest.unmock('javascript-state-machine');
// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(50000);
const randomUUID = require('@mojaloop/central-services-shared').Util.id({type: 'ulid'});

const MANAGEMENT_MOCK_SERVER_URL = 'http://localhost:5005';
const fs = require('fs');
const TLS_FOLDER_PATH = '../../docker/haproxy/tls'
const dfspCACert = fs.readFileSync(TLS_FOLDER_PATH + '/dfsp_cacert.pem', 'utf8');
const clientCert = fs.readFileSync(TLS_FOLDER_PATH + '/dfsp_client_cert.crt', 'utf8');
const clientKey = fs.readFileSync(TLS_FOLDER_PATH + '/dfsp_client_key.key', 'utf8');

const logger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

// Setup for Kafka Producer
const domainEventProducerOptions = {
  brokerList: 'localhost:9092',
  clientId: 'test-integration-client-id',
  topic: 'topic-sdk-outbound-domain-events'
}
const producer = new KafkaDomainEventProducer(domainEventProducerOptions, logger)

// Setup for Kafka Consumer
const domainEventConsumerOptions = {
  brokerList: 'localhost:9092',
  clientId: 'test-integration-client-id2',
  topics: ['topic-sdk-outbound-domain-events'],
  groupId: "test-integration-group-id"
}
var domainEvents = []
const _messageHandler = async (message) => {
  domainEvents.push(message);
}
const consumer = new KafkaDomainEventConsumer(_messageHandler.bind(this), domainEventConsumerOptions, logger)

describe("Tests for discovery part in FSPIOP Handler", () => {

  beforeEach(async () => {
    domainEvents = [];
  });

  beforeAll(async () => {
    await producer.init();
    await consumer.init();
    await consumer.start();
  });

  afterAll(async () => {
    await producer.destroy();
    await consumer.destroy();
  });

  // TESTS FOR PARTY LOOKUP
  test.only("partyInfoRequestedDmEvt should result in failure due to lack of outbound TLS certificates", async () => {
    // Clear the existing configuration if any
    await axios.post(`${MANAGEMENT_MOCK_SERVER_URL}/resetConfig`);

    const partyInfoRequestedDmEvt = new PartyInfoRequestedDmEvt({
    bulkId: randomUUID(),
    content: {
        transferId: randomUUID(),
        request: {
            partyIdType: 'MSISDN',
            partyIdentifier: '1234567890',
            partySubIdOrType: null,
        },
    },
    timestamp: Date.now(),
    headers: [],
    });

    // Wait for the TLS configuration change to be propagated to SDK
    await new Promise(resolve => setTimeout(resolve, 10000));

    await producer.sendDomainEvent(partyInfoRequestedDmEvt);

    // TODO: The following timeout can be enhanced with wrapRetries [https://github.com/mojaloop/project/issues/3408]
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check domain events published to kafka
    expect(domainEvents.length).toEqual(2);
    expect(domainEvents[0].getName()).toBe('PartyInfoRequestedDmEvt');
    expect(domainEvents[1].getName()).toBe('PartyInfoCallbackReceivedDmEvt');
    const callbackContent = domainEvents[1].getContent();
    // TODO: We are not checking for the specific error because SDK error response doesn't contain helpful error codes.
    // There is a story to address this issue [https://github.com/mojaloop/project/issues/3407]
    expect(callbackContent).toHaveProperty('partyErrorResult');

  });
  test.only("partyInfoRequestedDmEvt should pass after updating outbound TLS certificates", async () => {
    // Now update the outbound TLS configuration
    await axios.post(`${MANAGEMENT_MOCK_SERVER_URL}/updateOutboundTLSConfig`, {
      "mutualTLS": {
          "enabled": true
      },
      "creds": {
          "ca": dfspCACert,
          "cert": clientCert,
          "key": clientKey
      }
    });

    const partyInfoRequestedDmEvt = new PartyInfoRequestedDmEvt({
    bulkId: randomUUID(),
    content: {
        transferId: randomUUID(),
        request: {
            partyIdType: 'MSISDN',
            partyIdentifier: '1234567890',
            partySubIdOrType: null,
        },
    },
    timestamp: Date.now(),
    headers: [],
    });

    // Wait for the TLS configuration change to be propagated to SDK
    await new Promise(resolve => setTimeout(resolve, 10000));

    await producer.sendDomainEvent(partyInfoRequestedDmEvt);

    // TODO: The following timeout can be enhanced with wrapRetries [https://github.com/mojaloop/project/issues/3408]
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check domain events published to kafka
    expect(domainEvents.length).toEqual(2);
    expect(domainEvents[0].getName()).toBe('PartyInfoRequestedDmEvt');
    expect(domainEvents[1].getName()).toBe('PartyInfoCallbackReceivedDmEvt');
    const callbackContent = domainEvents[1].getContent();
    expect(callbackContent).toHaveProperty('partyResult');
    expect(callbackContent.partyResult).toHaveProperty('currentState');
    expect(callbackContent.partyResult.currentState).toEqual('COMPLETED');


  });
});
