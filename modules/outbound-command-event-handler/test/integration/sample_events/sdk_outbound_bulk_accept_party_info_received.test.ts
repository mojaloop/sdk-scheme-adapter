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
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

'use strict'

import { SDKSchemeAdapter } from "@mojaloop/api-snippets";
import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
    KafkaDomainEventProducer,
    IKafkaEventProducerOptions,
    RedisBulkTransactionStateRepo,
    IRedisBulkTransactionStateRepoOptions,
    IndividualTransferInternalState,
    SDKOutboundBulkAcceptPartyInfoReceivedDmEvt,
    ISDKOutboundBulkAcceptPartyInfoReceivedDmEvtData,
    SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { randomUUID } from "crypto";

import { BulkTransactionAgg } from '../../../src/domain'

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

const producerOptions: IKafkaEventProducerOptions = {
    brokerList: 'localhost:9092',
    clientId: 'test-integration_client_id',
    topic: 'topic-sdk-outbound-domain-events'
}

const REDIS_CONNECTION_URL = 'redis://localhost:6379'

const producer = new KafkaDomainEventProducer(producerOptions, logger)

const bulkTransactionId = randomUUID();
const homeTransactionId1 = randomUUID();

// Create bulk transaction entity repo
const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: REDIS_CONNECTION_URL,
};

const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);

const bulkRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
    bulkHomeTransactionID: "abc123",
    bulkTransactionId: bulkTransactionId,
    options: {
      onlyValidateParty: true,
      autoAcceptParty: {
        enabled: false
      },
      autoAcceptQuote: {
        enabled: false,
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
        homeTransactionId: homeTransactionId1,
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

describe.skip('SDKOutboundBulkAcceptPartyInfoRequested', () => {
  let bulkTransactionAgg: BulkTransactionAgg;
  beforeAll(async () => {
    await producer.init();
    await bulkTransactionEntityRepo.init();
    logger.info(`Created BulkTransactionStateRepo of type ${bulkTransactionEntityRepo.constructor.name}`);

    // Create aggregate
    bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
      bulkRequest,
      bulkTransactionEntityRepo,
      logger,
    );
    // Update individual transfers with partyInfo
    const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(allIndividualTransferIds[0])
    individualTransfer.setPartyResponse({
      party: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '16135551212',
          fspId: 'testpayeefsp1'
        }
      },
      currentState: SDKOutboundTransferState.COMPLETED
    })
    individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS)
    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer)
  });

  afterAll(async () => {
    await bulkTransactionEntityRepo.destroy();
    await producer.destroy();
  });

  test('should publish a domain event', async () => {
    const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();

    const sampleSDKOutboundBulkAcceptPartyInfoReceivedDmEvtData: ISDKOutboundBulkAcceptPartyInfoReceivedDmEvtData = {
      bulkId: bulkTransactionId,
      bulkTransactionContinuationAcceptParty: {
        individualTransfers: [
          {
            transferId: allIndividualTransferIds[0],
            acceptParty: true
          }
        ]
      },
      timestamp: Date.now(),
      headers: []
    }
    const domainEventObj = new SDKOutboundBulkAcceptPartyInfoReceivedDmEvt(sampleSDKOutboundBulkAcceptPartyInfoReceivedDmEvtData);
    await producer.sendDomainEvent(domainEventObj);
    await expect(true)
  })
})
