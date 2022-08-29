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
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict'

import { BulkTransactionAgg, IndividualTransferInternalState } from '../../../../src/domain';
import { InMemoryBulkTransactionStateRepo } from '../../../../src/infrastructure';
import { BULK_REQUEST } from '../../data/bulk_transaction_request'
import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { ILogger, LogLevel } from '@mojaloop/logging-bc-public-types-lib';
import { SDKSchemeAdapter } from '@mojaloop/api-snippets';


const logger: ILogger = new DefaultLogger('SDK-Scheme-Adapter', 'command-event-handler-unit-tests', '0.0.1', LogLevel.INFO);

const bulkTransactionEntityRepo = new InMemoryBulkTransactionStateRepo(logger);

var bulkId: string;

// import { randomUUID } from "crypto";

describe('BulkTransactionAggregate', () => {

    beforeAll(async () => {
        bulkTransactionEntityRepo.init()
    })

    afterAll(async () => {
        bulkTransactionEntityRepo.destroy()
    })

    describe('BulkTransactionAggregate creation', () => {
        let bulkTransactionAgg: BulkTransactionAgg;
        afterAll(async () => {
            bulkTransactionAgg.destroy();
        })
        test('BulkTransactionAggregate should be created from request', async () => {
            // Create aggregate
            bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
                BULK_REQUEST,
                bulkTransactionEntityRepo,
                logger,
            );
            expect(bulkTransactionAgg.bulkId).not.toBeNull()
            bulkId = bulkTransactionAgg.bulkId;
            const bulkTransactionEntity = bulkTransactionAgg.getBulkTransaction()
            const bulkTransactionEntityState = bulkTransactionEntity.exportState()
            expect(bulkTransactionEntityState.bulkHomeTransactionID).not.toBeNull()
            expect(bulkTransactionEntityState.bulkTransactionId).not.toBeNull()
            const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds()
            expect(Array.isArray(allIndividualTransferIds)).toBe(true)
            expect(allIndividualTransferIds.length).toEqual(2)
        })
        test('BulkTransactionAggregate should be created from repository', async () => {
            // Create aggregate
            bulkTransactionAgg = await BulkTransactionAgg.CreateFromRepo(
                bulkId,
                bulkTransactionEntityRepo,
                logger,
            );
            const bulkTransactionEntity = bulkTransactionAgg.getBulkTransaction()
            const bulkTransactionEntityState = bulkTransactionEntity.exportState()
            expect(bulkTransactionEntityState.bulkHomeTransactionID).not.toBeNull()
            expect(bulkTransactionEntityState.bulkTransactionId).not.toBeNull()
            const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds()
            expect(Array.isArray(allIndividualTransferIds)).toBe(true)
            expect(allIndividualTransferIds.length).toEqual(2)
        })
    })
    describe('createBatches', () => {
        let bulkTransactionAgg: BulkTransactionAgg;
        beforeEach(async () => {
            // Create aggregate
            bulkTransactionAgg = await BulkTransactionAgg.CreateFromRequest(
                BULK_REQUEST,
                bulkTransactionEntityRepo,
                logger,
            );
            // Simulate party resposnes
            const partyResponse1: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse = {
                party: {
                    body: {
                        partyIdInfo: {
                            partyIdType: 'MSISDN',
                            partyIdentifier: '123',
                            fspId: 'dfsp1'
                        }
                    },
                    headers: {}
                },
                currentState: 'COMPLETED'
            }
            const partyResponse2: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse = {
                party: {
                    body: {
                        partyIdInfo: {
                            partyIdType: 'MSISDN',
                            partyIdentifier: '321',
                            fspId: 'dfsp1'
                        }
                    },
                    headers: {}
                },
                currentState: 'COMPLETED'
            }
            const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
            const individualTransfer1 = await bulkTransactionAgg.getIndividualTransferById(allIndividualTransferIds[0]);
            individualTransfer1.setPartyResponse(partyResponse1);
            individualTransfer1.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
            await bulkTransactionAgg.setIndividualTransferById(individualTransfer1.id, individualTransfer1);
            const individualTransfer2 = await bulkTransactionAgg.getIndividualTransferById(allIndividualTransferIds[1]);
            individualTransfer2.setPartyResponse(partyResponse2);
            individualTransfer2.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
            await bulkTransactionAgg.setIndividualTransferById(individualTransfer2.id, individualTransfer2);
        })

        afterEach(async () => {
            bulkTransactionAgg.destroy();
        })
    
        test('createBatches should create a signle batch for two transfers', async () => {
            await bulkTransactionAgg.createBatches(10);
            const bulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();
            expect(bulkBatchIds.length).toEqual(1);
        })
        test('createBatches should create two batches for two transfers if the limit is 1', async () => {
            await bulkTransactionAgg.createBatches(1);
            const bulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();
            expect(bulkBatchIds.length).toEqual(2);
        })
        test('createBatches should create two batches for two transfers if there is a second fsp', async () => {
            // Add another individual transfer with different dfspId
            const partyResponse3: SDKSchemeAdapter.Outbound.V2_0_0.Types.partiesByIdResponse = {
                party: {
                    body: {
                        partyIdInfo: {
                            partyIdType: 'MSISDN',
                            partyIdentifier: '321',
                            fspId: 'dfsp2'
                        }
                    },
                    headers: {}
                },
                currentState: 'COMPLETED'
            }
            const allIndividualTransferIds = await bulkTransactionAgg.getAllIndividualTransferIds();
            const individualTransfer3 = await bulkTransactionAgg.getIndividualTransferById(allIndividualTransferIds[1]);
            individualTransfer3.setPartyResponse(partyResponse3);
            individualTransfer3.setTransferState(IndividualTransferInternalState.DISCOVERY_SUCCESS);
            await bulkTransactionAgg.setIndividualTransferById(individualTransfer3.id, individualTransfer3);

            await bulkTransactionAgg.createBatches(10);
            const bulkBatchIds = await bulkTransactionAgg.getAllBulkBatchIds();
            expect(bulkBatchIds.length).toEqual(2);
        })
        test('createBatches should throw error when called second time', async () => {
            await expect(bulkTransactionAgg.createBatches(10)).resolves.toBeUndefined();
            await expect(bulkTransactionAgg.createBatches(10)).rejects.toThrowError();
        })
    })
})
