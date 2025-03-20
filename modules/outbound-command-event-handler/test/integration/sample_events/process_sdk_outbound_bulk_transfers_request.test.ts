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

// Imports for Test Utils
import { Timer } from "../../util";

const MESSAGE_TIMEOUT = 2000;

// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(20000)

// Imports for Tests
import { SDKSchemeAdapter } from "@mojaloop/api-snippets";
import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
    // KafkaDomainEventProducer,
    IKafkaEventProducerOptions,
    RedisBulkTransactionStateRepo,
    IRedisBulkTransactionStateRepoOptions,
    KafkaCommandEventProducer,
    ProcessSDKOutboundBulkTransfersRequestCmdEvt,
    IProcessSDKOutboundBulkTransfersRequestCmdEvtData,
    BulkTransactionInternalState,
    IndividualTransferInternalState,
    BulkBatchInternalState,
    SDKOutboundTransferState,
    PartyResponse,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

import { randomUUID } from "crypto";

import { BulkTransactionAgg } from '@module-domain'

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

const KAFKA_HOST = 'localhost:9092';

// Setup for Kafka Domain Event Producer
const producerDomOptions: IKafkaEventProducerOptions = {
    brokerList: KAFKA_HOST,
    clientId: 'test-integration_client_id',
    topic: 'topic-sdk-outbound-domain-events'
}

// Setup for Kafka Command Event Producer
const producerCmdOptions: IKafkaEventProducerOptions = {
  brokerList: KAFKA_HOST,
  clientId: 'test-integration_client_id',
  topic: 'topic-sdk-outbound-command-events'
}

const REDIS_CONNECTION_URL = 'redis://localhost:6379'

const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
  connStr: REDIS_CONNECTION_URL
}

const bulkTransactionId = randomUUID();
const homeTransactionId = randomUUID();

// Initial BulkTransactionRequest
const bulkTransactionRequest: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkTransactionRequest = {
    bulkHomeTransactionID: homeTransactionId,
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
        homeTransactionId: homeTransactionId,
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

describe('processSDKOutboundBulkTransfersRequestCmdEvt', () => {
  // let producerDom: KafkaDomainEventProducer;
  let producerCmd: KafkaCommandEventProducer;
  let bulkTransactionAgg: BulkTransactionAgg;
  let bulkTransactionEntityRepo: RedisBulkTransactionStateRepo;

  beforeAll(async () => {
    // Setup for Kafka Producers
    // producerDom = new KafkaDomainEventProducer(producerDomOptions, logger)
    // await producerDom.init();
    producerCmd = new KafkaCommandEventProducer(producerCmdOptions, logger)
    await producerCmd.init();

    // Setup for Redis access
    bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);
    await bulkTransactionEntityRepo.init();
  });

  afterAll(async () => {
    // await producerDom.destroy();
    await producerCmd.destroy();
    await bulkTransactionEntityRepo.destroy();
  });

  test('should be processed by handleProcessSDKOutboundBulkTransfersRequestCmdEvt', async () => {
    console.dir(bulkTransactionRequest)

    // Create aggregate
    bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
      bulkTransactionRequest,
      bulkTransactionEntityRepo,
      logger,
    );

    const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();

    await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.DISCOVERY_COMPLETED)
    const individualTransfer = await bulkTransactionAgg.getIndividualTransferById(allIndividualTransferIds[0])

    // Lets add a partyResponse
    const partyResponse: PartyResponse = {
      party: {
        partyIdInfo: { ...bulkTransactionRequest.individualTransfers[0].to.partyIdInfo, fspId: 'test' },
        name: 'test',
      },
      currentState: "COMPLETED",
    };

    individualTransfer.setPartyResponse(partyResponse)
    individualTransfer.setTransferState(IndividualTransferInternalState.DISCOVERY_ACCEPTED)
    await bulkTransactionAgg.setIndividualTransferById(individualTransfer.id, individualTransfer)

    // Lets generate BulkQuoteBatches
    const generateBulkQuoteBatchesResult = await bulkTransactionAgg.generateBulkQuoteBatches(10);

    console.dir(generateBulkQuoteBatchesResult);

    // Lets fetch BulkBatchIds
    const bulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();

    // Lets fetch the first BulkBatch
    const bulkBatch = await bulkTransactionAgg.getBulkBatchEntityById(bulkBatchIds[0])

    // Lets lookup the matching individualTransfer based on the individualQuote
    const individualTransferId = bulkBatch.getReferenceIdForQuoteId(bulkBatch.bulkQuotesRequest.individualQuotes[0].quoteId);

    // Lets create a bulkQuoteResult
    const bulkQuoteResponse: SDKSchemeAdapter.V2_1_0.Outbound.Types.bulkQuoteResponse = {
      bulkQuoteId: bulkBatch.bulkQuoteId,
      expiration: '2016-05-24T08:38:08.699-04:00',
      homeTransactionId: bulkTransactionRequest.bulkHomeTransactionID,
      currentState: SDKOutboundTransferState.COMPLETED,
      individualQuoteResults: [
        {
          quoteId: bulkBatch.bulkQuotesRequest.individualQuotes[0].quoteId,
          transferAmount: {
            currency: 'USD',
            amount: '122'
          },
          payeeReceiveAmount: {
            currency: 'USD',
            amount: '122'
          },
          ilpPacket: 'AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDdqUUZERmZlakgyOVc4bXFmNEpLMHlGTFGCAUBQU0svMS4wCk5vbmNlOiB1SXlweUYzY3pYSXBFdzVVc05TYWh3CkVuY3J5cHRpb246IG5vbmUKUGF5bWVudC1JZDogMTMyMzZhM2ItOGZhOC00MTYzLTg0NDctNGMzZWQzZGE5OGE3CgpDb250ZW50LUxlbmd0aDogMTM1CkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvbgpTZW5kZXItSWRlbnRpZmllcjogOTI4MDYzOTEKCiJ7XCJmZWVcIjowLFwidHJhbnNmZXJDb2RlXCI6XCJpbnZvaWNlXCIsXCJkZWJpdE5hbWVcIjpcImFsaWNlIGNvb3BlclwiLFwiY3JlZGl0TmFtZVwiOlwibWVyIGNoYW50XCIsXCJkZWJpdElkZW50aWZpZXJcIjpcIjkyODA2MzkxXCJ9IgA,',
          condition: '12345'
        }
      ]
    }
    bulkBatch.setBulkQuotesResponse(bulkQuoteResponse);
    bulkBatch.setState(BulkBatchInternalState.AGREEMENT_COMPLETED);

    // Update BulkBatch
    await bulkTransactionAgg.setBulkBatchById(bulkBatch.id, bulkBatch);

    console.dir(bulkBatch);

    // Lets complete the Agreement stage by changing the state to match the result

    await bulkTransactionAgg.setGlobalState(BulkTransactionInternalState.AGREEMENT_COMPLETED);

    const individualTransferAfterBulkQuotesResponse = await bulkTransactionAgg.getIndividualTransferById(individualTransferId);

    individualTransferAfterBulkQuotesResponse.setTransferState(IndividualTransferInternalState.AGREEMENT_SUCCESS);

    await bulkTransactionAgg.setIndividualTransferById(individualTransferAfterBulkQuotesResponse.id, individualTransfer);

    // Lets generate the processSDKOutboundBulkTransfersRequestCmdEvt
    const processSDKOutboundBulkTransfersRequestCmdEvtData: IProcessSDKOutboundBulkTransfersRequestCmdEvtData = {
      bulkId: bulkTransactionRequest.bulkTransactionId,
      timestamp: Date.now(),
      headers: null
    }

    const processSDKOutboundBulkTransfersRequestCmdEvt = new ProcessSDKOutboundBulkTransfersRequestCmdEvt(processSDKOutboundBulkTransfersRequestCmdEvtData);

    // Lets publish the processSDKOutboundBulkTransfersRequestCmdEvt
    await producerCmd.sendCommandEvent(processSDKOutboundBulkTransfersRequestCmdEvt);

    // TODO: Add consumer to catch resulting DmEvt for validations
    await expect(true)
  })
})
