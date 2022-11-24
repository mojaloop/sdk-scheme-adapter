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
 --------------
 ******/

"use strict";

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import {
  BulkBatchInternalState,
  BulkBatchState,
  BulkQuotesCallbackProcessedDmEvt,
  BulkTransactionInternalState,
  BulkTransfersRequestedDmEvt,
  IKafkaEventConsumerOptions,
  IKafkaEventProducerOptions,
  IndividualTransferInternalState,
  IRedisBulkTransactionStateRepoOptions,
  SDKOutboundBulkAcceptQuoteProcessedDmEvt,
  SDKOutboundBulkQuotesRequestProcessedDmEvt,
  SDKOutboundTransferState,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib'
import { randomUUID } from "crypto";
import { ProcessHelper, StopAfterEventEnum } from "../../../util/generator";

// Tests can timeout in a CI pipeline so giving it leeway
jest.setTimeout(20000)

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
      And callback for quote batch is successful \
      And the callback has a combination of success and failed responses for individual quotes \
      When Inbound command event ProcessSDKOutboundBulkTransfersRequestCmdEvt is received \
      Then the global Bulk Transaction State should be updated to TRANSFERS_PROCESSING \
      And the individual batch state should be equal to either TRANSFERS_PROCESSING or TRANSFERS_FAILED, \
      And for each individual transfers in the batch, the state AGREEMENT_ACCEPTED or AGREEMENT_REJECTED depending on the acceptQuotes = TRUE/FALSE, \
      And for each individual transfers in an AGREEMENT_FAILED state should not be altered, \
      And the individual quote data in redis should be updated with the response \
      And domain event BulkQuotesCallbackProcessed should be published \
      And domain event SDKOutboundBulkQuotesRequestProcessed should be published \
      And domain event SDKOutboundBulkAutoAcceptQuoteProcessedDmEvt should be published \
      And domain event BulkTransfersRequestedDmEvt should be published \
    ",
    async () => {
    // SETUP // ACT
    const result = await processHelper.generate({
      StopAfterEvent: StopAfterEventEnum.ProcessSDKOutboundBulkTransfersRequestCmdEvt,
      messageTimeout,
    })

    // ASSERT

    const bulkTransactionId = processHelper.bulkTransactionRequest.bulkTransactionId;

    let bulkBatchOne: BulkBatchState | undefined;
    let bulkBatchTwo: BulkBatchState | undefined;
    if (result.bulkBatchIds){
      bulkBatchOne = await processHelper.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, result.bulkBatchIds[0]);
      bulkBatchTwo = await processHelper.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, result.bulkBatchIds[1]);
    } else {
      throw Error('Shouldnt be here'); // TODO: Handle this
    }

    // Bulk batch ids are unordered so check the quotes for the intended fsp
    // so we can send proper callbacks
    let receiverFspBatch;
    let differentFspBatch;
    if (bulkBatchOne?.bulkQuotesRequest?.individualQuotes[0]?.to?.fspId == 'receiverfsp') {
      receiverFspBatch = bulkBatchOne
      differentFspBatch = bulkBatchTwo
    } else {
      receiverFspBatch = bulkBatchTwo
      differentFspBatch = bulkBatchOne
    }

    if (receiverFspBatch === undefined) {
      throw Error('Shouldnt be here'); // TODO: Handle this
    }

    if (differentFspBatch === undefined) {
      throw Error('Shouldnt be here'); // TODO: Handle this
    }

    // Check that the state of bulk batch for receiverfsp to be TRANSFERS_PROCESSING
    const postBulkBatchReceiverFsp = await processHelper.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, receiverFspBatch.id);
    expect(postBulkBatchReceiverFsp.state).toBe(BulkBatchInternalState.TRANSFERS_PROCESSING);

    // Check that bulkQuoteResponse state has been updated to COMPLETED
    expect(postBulkBatchReceiverFsp.bulkQuotesResponse!.currentState).toEqual(SDKOutboundTransferState.COMPLETED)

    // Check that the state of bulk batch for differentfsp to be AGREEMENT_FAILED
    const postBulkBatchDifferentFsp = await processHelper.bulkTransactionEntityRepo.getBulkBatch(bulkTransactionId, differentFspBatch.id);
    expect(postBulkBatchDifferentFsp.state).toBe(BulkBatchInternalState.TRANSFERS_FAILED);

    // Check that bulkQuoteResponse state has been updated to COMPLETED
    expect(postBulkBatchDifferentFsp.bulkQuotesResponse!.currentState).toEqual(SDKOutboundTransferState.ERROR_OCCURRED)

    if (result?.individualTransferIds === undefined) {
      throw Error('Shouldnt be here'); // TODO: Handle this
    }

    if (result?.amountList === undefined) {
      throw Error('Shouldnt be here'); // TODO: Handle this
    }

    // Check the individual transfer state whose quote was successful in a successful bulk quote batch
    expect((await processHelper.bulkTransactionEntityRepo.getIndividualTransfer(
      bulkTransactionId,
      result?.individualTransferIds[result?.amountList?.indexOf('1')])).state
    ).toBe(IndividualTransferInternalState.AGREEMENT_ACCEPTED);

    // Check the individual transfer state whose quote was errored in a successful bulk quote batch
    expect((await processHelper.bulkTransactionEntityRepo.getIndividualTransfer(
      bulkTransactionId,
      result?.individualTransferIds[result?.amountList?.indexOf('2')])).state
    ).toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

    // Check the individual transfer state whose quotes were in an errored bulk quote batch
    expect((await processHelper.bulkTransactionEntityRepo.getIndividualTransfer(
      bulkTransactionId,
      result?.individualTransferIds[result?.amountList?.indexOf('3')])).state
    ).toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

    expect((await processHelper.bulkTransactionEntityRepo.getIndividualTransfer(
      bulkTransactionId,
      result?.individualTransferIds[result?.amountList?.indexOf('4')])).state
    ).toBe(IndividualTransferInternalState.AGREEMENT_FAILED);

    // Now that all the bulk batches have reached a final state check the global state
    // Check that the global state of bulk to be TRANSFERS_PROCESSING
    const bulkStateAgreementCompleted = await processHelper.bulkTransactionEntityRepo.load(bulkTransactionId);
    expect(bulkStateAgreementCompleted.state).toBe(BulkTransactionInternalState.TRANSFERS_PROCESSING);

    // Check that command handler published BulkQuotesCallbackProcessed message
    const hasBulkQuotesCallbackProcessed = (processHelper.domainEvents.find((e) => e.getName() === BulkQuotesCallbackProcessedDmEvt.name));
    expect(hasBulkQuotesCallbackProcessed).toBeTruthy();

    // Check that command handler published SDKOutboundBulkQuotesRequestProcessed message
    const hasSDKOutboundBulkQuotesRequestProcessed = (processHelper.domainEvents.find((e) => e.getName() === SDKOutboundBulkQuotesRequestProcessedDmEvt.name));
    expect(hasSDKOutboundBulkQuotesRequestProcessed).toBeTruthy();

    // Check that command handler published SDKOutboundBulkAutoAcceptQuoteProcessed message
    const hasSDKOutboundBulkAcceptQuoteProcessedDmEvt = (processHelper.domainEvents.find((e) => e.getName() === SDKOutboundBulkAcceptQuoteProcessedDmEvt.name));
    expect(hasSDKOutboundBulkAcceptQuoteProcessedDmEvt).toBeTruthy();

    // Check that command handler published hasBulkTransfersRequested message
    const hasBulkTransfersRequested = (processHelper.domainEvents.find((e) => e.getName() === BulkTransfersRequestedDmEvt.name));
    expect(hasBulkTransfersRequested).toBeTruthy();
  });
});
