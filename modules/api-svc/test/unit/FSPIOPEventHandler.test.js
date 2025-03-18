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

 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

const {
    PartyInfoRequestedDmEvt,
    BulkQuotesRequestedDmEvt,
    BulkTransfersRequestedDmEvt,
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const { FSPIOPEventHandler } = require('../../src/FSPIOPEventHandler');
const { logger } = require('../../src/lib/logger');
const {
    OutboundBulkQuotesModel,
    PartiesModel,
    OutboundBulkTransfersModel,
    SDKStateEnum
} = require('../../src/lib/model');

const bulkQuoteRequest = require('../unit/lib/model/data/bulkQuoteRequest.json');
const config = require('./data/defaultConfig.json');

describe('FSPIOPEventHandler', () => {
    let fspiopEventHandler;

    beforeEach(async () => {
        fspiopEventHandler = new FSPIOPEventHandler({
            config,
            logger,
        });
        await fspiopEventHandler.start();
    });

    afterAll(async () => {
        await fspiopEventHandler.stop();
    });

    test('should handle PartyInfoRequestedDmEvt event', async () => {
        const request = {
            partyIdType: 'PERSONAL_ID',
            partyIdentifier: '16135551212',
            partySubIdOrType: 'PASSPORT',
        };
        const bulkId = 'bulk-tx-test';
        const event = new PartyInfoRequestedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            content: {
                transferId: 'faaaea55-da85-4818-8b16-f720f9737889',
                request,
            },
        });

        const partyResult = {
            partyIdInfo: {
                ...request,
                fspId: 'mojaloop-sdk'
            },
            personalInfo: {
                complexName: {
                    firstName: 'Bob',
                    lastName: 'Dylan'
                },
                dateOfBirth: '2010-10-10'
            },
            name: 'Bob Dylan',
            merchantClassificationCode: '123'
        };

        const mockedPSM = {
            run: jest.fn(async () => ({
                party: {
                    body: partyResult,
                },
                currentState: SDKStateEnum.COMPLETED,
            }))
        };

        const createSpy = jest.spyOn(PartiesModel, 'create')
            .mockImplementationOnce(async () => mockedPSM);

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        // PSM model creation
        const cacheKey = PartiesModel.generateKey({
            type: request.partyIdType,
            id: request.partyIdentifier,
            subId: request.partySubIdOrType
        });
        expect(createSpy.mock.calls[0][1]).toEqual(cacheKey);

        // run workflow
        expect(mockedPSM.run).toBeCalledWith({
            type: request.partyIdType,
            id: request.partyIdentifier,
            subId: request.partySubIdOrType
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        const sent = KafkaDomainEventProducer.mock.sendDomainEvent.mock.calls[0][0];
        expect(sent._data.name).toEqual('PartyInfoCallbackReceivedDmEvt');
        expect(sent._data.content).toEqual({
            transferId: 'faaaea55-da85-4818-8b16-f720f9737889',
            partyResult: {
                party: partyResult,
                currentState: SDKStateEnum.COMPLETED,
            }
        });
    });

    test('should return error information for PartyInfoRequestedDmEvt event', async () => {
        const request = {
            partyIdType: 'PERSONAL_ID',
            partyIdentifier: '16135551212',
            partySubIdOrType: 'PASSPORT',
        };
        const bulkId = 'bulk-tx-test';
        const event = new PartyInfoRequestedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            content: {
                transferId: 'faaaea55-da85-4818-8b16-f720f9737889',
                request,
            },
        });

        const partyResult = {
            partyIdInfo: {
                ...request,
            },
        };

        const mockedPSM = {
            run: jest.fn(async () => ({
                party: {
                    body: partyResult,
                },
                currentState: 'ERROR_OCCURRED',
                errorInformation: {
                    errorCode: '12345',
                    errorDescription: 'ID Not Found'
                },
            }))
        };

        const createSpy = jest.spyOn(PartiesModel, 'create')
            .mockImplementationOnce(async () => mockedPSM);

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        // PSM model creation
        const cacheKey = PartiesModel.generateKey({
            type: request.partyIdType,
            id: request.partyIdentifier,
            subId: request.partySubIdOrType
        });
        expect(createSpy.mock.calls[0][1]).toEqual(cacheKey);

        // run workflow
        expect(mockedPSM.run).toBeCalledWith({
            type: request.partyIdType,
            id: request.partyIdentifier,
            subId: request.partySubIdOrType
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        const sent = KafkaDomainEventProducer.mock.sendDomainEvent.mock.calls[0][0];
        expect(sent._data.name).toEqual('PartyInfoCallbackReceivedDmEvt');
        expect(sent._data.content).toEqual({
            transferId: 'faaaea55-da85-4818-8b16-f720f9737889',
            partyResult: {
                party: partyResult,
                currentState: 'ERROR_OCCURRED',
                errorInformation: {
                    errorCode: '12345',
                    errorDescription: 'ID Not Found'
                },
            },
        });
    });

    test('should handle BulkQuotesRequestedDmEvt event', async () => {
        const bulkId = 'bulk-tx-test';
        const event = new BulkQuotesRequestedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            content: {
                batchId: '61c35bae-77d0-4f7d-b894-be375b838ff6',
                request: bulkQuoteRequest,
            },
        });

        const bulkQuoteResponse = {
            homeTransactionId: '7c5eaec1-5db2-4aca-92dd-0b68071becaa',
            bulkQuoteId: '7106d650-fb27-4a2a-9b70-c9731fc058aa',
            from: {
                idType: 'MSISDN',
                idValue: '123456789',
                type: 'CONSUMER',
                displayName: 'PayerFirst PayerLast',
                firstName: 'PayerFirst',
                middleName: 'Something',
                lastName: 'PayerLast',
                fspId: 'ttkpm4mlreceiver'
            },
            individualQuotes: [
                {
                    quoteId: '5fdba48f-0388-4a56-94e9-57f1bc4d78fc',
                    to: {
                        type: 'CONSUMER',
                        idType: 'MSISDN',
                        idValue: '48500002222',
                        fspId: 'ttkpm4mlreceiver'
                    },
                    amountType: 'SEND',
                    currency: 'USD',
                    amount: '10',
                    transactionType: 'TRANSFER',
                    subScenario: 'SUBSCENARIO',
                    note: 'test'
                }
            ]
        };

        const initializeSpy = jest.spyOn(OutboundBulkQuotesModel.prototype, 'initialize')
            .mockImplementationOnce(async () => bulkQuoteResponse);

        jest.spyOn(OutboundBulkQuotesModel.prototype, 'run')
            .mockImplementationOnce(async () => bulkQuoteResponse);

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        // run workflow
        expect(initializeSpy).toBeCalledWith(bulkQuoteRequest);

        const sent = KafkaDomainEventProducer.mock.sendDomainEvent.mock.calls[0][0];
        expect(sent._data.name).toEqual('BulkQuotesCallbackReceivedDmEvt');
        expect(sent._data.content).toEqual({
            batchId: '61c35bae-77d0-4f7d-b894-be375b838ff6',
            bulkQuotesResult: bulkQuoteResponse,
        });
    });

    test('should handle BulkTransfersRequestedDmEvt event', async () => {
        const bulkTransfersRequest = {
            homeTransactionId: 'home-transaction-id',
            from: {
                idType: 'MSISDN',
                idValue: '123456'
            },
            individualTransfers: [
                {
                    homeTransactionId: 'home-individual-transfer-id',
                    to: {
                        partyIdInfo: {
                            partyIdType: 'MSISDN',
                            partyIdentifier: '1'
                        },
                    },
                    amountType: 'SEND',
                    currency: 'USD',
                    amount: '1'
                },
            ]
        };
        const bulkTransfersRequestedDmEvt = new BulkTransfersRequestedDmEvt({
            bulkId: 'bulk-tx-test',
            headers: [],
            timestamp: Date.now(),
            content: {
                batchId: '61c35bae-77d0-4f7d-b894-be375b838ff6',
                bulkTransfersRequest,
            },
        });

        const bulkTransfersResult = {
            bulkTransferId: '81c35bae-77d0-4f7d-b894-be375b838ff6',
            currentState: SDKStateEnum.COMPLETED,
            individualTransferResults: [
                {
                    transferId: 'individual-transfer-id',
                    to: {
                        partyIdInfo: {
                            partyIdType: 'MSISDN',
                            partyIdentifier: '1'
                        },
                    },
                    amountType: 'SEND',
                    currency: 'USD',
                    amount: '1'
                },
            ]
        };

        const initializeSpy = jest.spyOn(OutboundBulkTransfersModel.prototype, 'initialize')
            .mockImplementationOnce(async () => bulkTransfersResult);

        jest.spyOn(OutboundBulkTransfersModel.prototype, 'run')
            .mockImplementationOnce(async () => bulkTransfersResult);


        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(bulkTransfersRequestedDmEvt);

        // run workflow
        expect(initializeSpy).toBeCalledWith(bulkTransfersRequestedDmEvt.request);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const sent = KafkaDomainEventProducer.mock.sendDomainEvent.mock.calls[0][0];
        expect(sent._data.name).toEqual('BulkTransfersCallbackReceivedDmEvt');
        expect(sent._data.content).toEqual({
            batchId: '61c35bae-77d0-4f7d-b894-be375b838ff6',
            bulkTransfersResult
        });
    });
});

