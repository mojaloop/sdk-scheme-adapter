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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

const uuid = require('@mojaloop/central-services-shared').Util.id({ type: 'ulid' });
const mockError = require('./data/mockError');
const mockBulkQuoteError = require('./data/mockBulkQuoteError');
const mockBulkTransferError = require('./data/mockBulkTransferError');
const mockRequestToPayError = require('./data/mockRequestToPayError');
const mockRequestToPayTransferError = require('./data/mockRequestToPayTransferError');
const mockGetPartiesError = require('./data/mockGetPartiesError');
const transferRequest = require('./data/transferRequest');
const bulkTransferRequest = require('./data/bulkTransferRequest');
const bulkTransactionRequest = require('./data/bulkTransactionRequest.json');
const bulkQuoteRequest = require('./data/bulkQuoteRequest');
const requestToPayPayload = require('./data/requestToPay');
const requestToPayTransferRequest = require('./data/requestToPayTransferRequest');
const mockLogger = require('../mockLogger');

jest.mock('~/lib/model');

const handlers = require('~/OutboundServer/handlers');
const {
    OutboundTransfersModel,
    OutboundBulkTransfersModel,
    OutboundBulkQuotesModel,
    OutboundRequestToPayTransferModel,
    OutboundRequestToPayModel,
    PartiesModel,
    QuotesModel,
    TransfersModel
} = require('~/lib/model');

/**
 * Mock the outbound transfer model to simulate throwing errors
 */
OutboundTransfersModel.mockImplementation(() => {
    return {
        run: async () => {
            // throw the mockError object when the model is run
            throw mockError;
        },
        initialize: async () => {
            // nothing needed here
            return;
        },
        load: async () => {
            // nothing needed here
            return;
        }
    };
});

/**
 * Mock the outbound bulk transfers model to simulate throwing errors
 */
OutboundBulkTransfersModel.mockImplementation(() => {
    return {
        run: async () => {
            throw mockBulkTransferError;
        },
        initialize: async () => {
            return;
        },
        load: async () => {
            return;
        }
    };
});

/**
 * Mock the outbound bulk quotes model to simulate throwing errors
 */
OutboundBulkQuotesModel.mockImplementation(() => {
    return {
        run: async () => {
            throw mockBulkQuoteError;
        },
        initialize: async () => {
            return;
        },
        load: async () => {
            return;
        }
    };
});

/**
 * Mock the outbound transfer model to simulate throwing errors
 */
OutboundRequestToPayTransferModel.mockImplementation(() => {
    return {
        run: async () => {
            // throw the mockError object when the model is run
            throw mockRequestToPayTransferError;
        },
        initialize: async () => {
            // nothing needed here
            return;
        },
        load: async () => {
            // nothing needed here
            return;
        }
    };
});

/**
 * Mock the outbound request to pay model to simulate throwing errors
 */
OutboundRequestToPayModel.mockImplementation(() => {
    return {
        run: async () => {
            // throw the mockError object when the model is run
            throw mockRequestToPayError;
        },
        initialize: async () => {
            // nothing needed here
            return;
        },
        load: async () => {
            // nothing needed here
            return;
        }
    };
});


describe('Outbound API handlers:', () => {
    describe('POST /transfers', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: transferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                }
            };

            await handlers['/transfers'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode)
                .toEqual(mockError.transferState.lastError.mojaloopError.errorInformation.errorCode);
            expect(mockContext.response.body.transferState).toEqual(mockError.transferState);
        });

        test('uses correct extension list error code for response body statusCode when configured to do so', async () => {
            const mockContext = {
                request: {
                    body: transferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        outboundErrorStatusCodeExtensionKey: 'extErrorKey'  // <- tell the handler to use this extensionList item as source of statusCode
                    },
                    logger: mockLogger(),
                }
            };

            await handlers['/transfers'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');

            // in this case, where we have set outboundErrorExtensionKey config we expect the error body statusCode
            // property to come from the extensionList item with the corresponding key 'extErrorKey'
            expect(mockContext.response.body.statusCode).toEqual('9999');
            expect(mockContext.response.body.transferState).toEqual(mockError.transferState);
        });
    });

    describe('PUT /transfers', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: {
                        acceptQuote: true
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                    path: {
                        params: {
                            transferId: '12345'
                        }
                    }
                }
            };

            await handlers['/transfers/{transferId}'].put(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode).toEqual('3204');
            expect(mockContext.response.body.transferState).toEqual(mockError.transferState);
        });
    });

    describe('POST /bulkTransfers', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: bulkTransferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                }
            };

            await handlers['/bulkTransfers'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode)
                .toEqual(mockBulkTransferError.bulkTransferState.lastError.mojaloopError.errorInformation.errorCode);
            expect(mockContext.response.body.bulkTransferState).toEqual(mockBulkTransferError.bulkTransferState);
        });

        test('uses correct extension list error code for response body statusCode when configured to do so', async () => {
            const mockContext = {
                request: {
                    body: bulkTransferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        outboundErrorStatusCodeExtensionKey: 'extErrorKey'  // <- tell the handler to use this extensionList item as source of statusCode
                    },
                    logger: mockLogger(),
                }
            };

            await handlers['/bulkTransfers'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');

            // in this case, where we have set outboundErrorExtensionKey config we expect the error body statusCode
            // property to come from the extensionList item with the corresponding key 'extErrorKey'
            expect(mockContext.response.body.statusCode).toEqual('9999');
            expect(mockContext.response.body.bulkTransferState).toEqual(mockBulkTransferError.bulkTransferState);
        });
    });

    describe('POST /bulkQuotes', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: bulkQuoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                }
            };

            await handlers['/bulkQuotes'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode)
                .toEqual(mockBulkQuoteError.bulkQuoteState.lastError.mojaloopError.errorInformation.errorCode);
            expect(mockContext.response.body.bulkQuoteState).toEqual(mockBulkQuoteError.bulkQuoteState);
        });

        test('uses correct extension list error code for response body statusCode when configured to do so', async () => {
            const mockContext = {
                request: {
                    body: bulkQuoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        outboundErrorStatusCodeExtensionKey: 'extErrorKey'  // <- tell the handler to use this extensionList item as source of statusCode
                    },
                    logger: mockLogger(),
                }
            };

            await handlers['/bulkQuotes'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');

            // in this case, where we have set outboundErrorExtensionKey config we expect the error body statusCode
            // property to come from the extensionList item with the corresponding key 'extErrorKey'
            expect(mockContext.response.body.statusCode).toEqual('9999');
            expect(mockContext.response.body.bulkQuoteState).toEqual(mockBulkQuoteError.bulkQuoteState);
        });
    });

    describe('POST /bulkTransactions', () => {
        test('should send SDKOutboundBulkRequestReceivedDmEvt event', async () => {
            const mockContext = {
                request: {
                    body: bulkTransactionRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                    eventLogger: { info: () => {}},
                    eventProducer: { sendDomainEvent: jest.fn() },
                }
            };

            await handlers['/bulkTransactions'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(202);
            const arg = mockContext.state.eventProducer.sendDomainEvent.mock.calls[0][0];
            expect(arg._data.content).toEqual(bulkTransactionRequest);
            expect(arg._data.name).toEqual('SDKOutboundBulkRequestReceivedDmEvt');
            expect(arg._data.headers).toEqual([mockContext.request.headers]);
        });
    });

    describe('PUT /bulkTransactions', () => {
        test('should send SDKOutboundBulkAcceptPartyInfoReceivedDmEvt event when transfer has acceptParty', async () => {
            const body = {
                bulkHomeTransactionID: 'home-tx-id',
                individualTransfers: [
                    {
                        homeTransactionId: 'home-tx-id-1',
                        transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                        acceptParty: true,
                    },
                ]
            };
            const mockContext = {
                request: {
                    body,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                    eventLogger: { info: () => {}},
                    eventProducer: { sendDomainEvent: jest.fn() },
                    path: {
                        params: {
                            bulkTransactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                        }
                    },
                }
            };

            await handlers['/bulkTransactions/{bulkTransactionId}'].put(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(202);
            const arg = mockContext.state.eventProducer.sendDomainEvent.mock.calls[0][0];
            expect(arg._data.content).toEqual(body);
            expect(arg._data.name).toEqual('SDKOutboundBulkAcceptPartyInfoReceivedDmEvt');
            expect(arg._data.headers).toEqual([mockContext.request.headers]);
        });

        test('should send SDKOutboundBulkAcceptQuoteReceivedDmEvt event when transfer has acceptQuote', async () => {
            const body = {
                bulkHomeTransactionID: 'home-tx-id',
                individualTransfers: [
                    {
                        homeTransactionId: 'home-tx-id-1',
                        transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                        acceptQuote: true,
                    },
                ]
            };
            const mockContext = {
                request: {
                    body,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                    eventLogger: { info: () => {}},
                    eventProducer: { sendDomainEvent: jest.fn() },
                    path: {
                        params: {
                            bulkTransactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                        }
                    },
                }
            };

            await handlers['/bulkTransactions/{bulkTransactionId}'].put(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(202);
            const arg = mockContext.state.eventProducer.sendDomainEvent.mock.calls[0][0];
            expect(arg._data.content).toEqual(body);
            expect(arg._data.name).toEqual('SDKOutboundBulkAcceptQuoteReceivedDmEvt');
            expect(arg._data.headers).toEqual([mockContext.request.headers]);
        });
    });

    describe('POST /requestToPayTransfer', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: requestToPayTransferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                }
            };

            await handlers['/requestToPayTransfer'].post(mockContext);
            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode)
                .toEqual(mockRequestToPayTransferError.requestToPayTransferState.lastError.mojaloopError.errorInformation.errorCode);
            expect(mockContext.response.body.requestToPayTransferState).toEqual(mockRequestToPayTransferError.requestToPayTransferState);
        });
    });

    describe('POST /requestToPay', () => {
        test('returns correct error response body when model throws mojaloop error', async () => {
            const mockContext = {
                request: {
                    body: requestToPayPayload,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger(),
                }
            };

            await handlers['/requestToPay'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode).toEqual('3204');
            expect(mockContext.response.body.requestToPayState).toEqual(mockRequestToPayError.requestToPayState);
        });
    });

    describe('GET /parties/{Type}/{ID}/{SubId}', () => {
        test('happy flow', async() => {

            const mockContext = {
                request: {},
                response: {},
                state: {
                    conf: {},
                    wso2: 'mocked wso2',
                    logger: mockLogger({ app: 'outbound-api-handlers-test'}),
                    cache: { the: 'mocked cache' },
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '1234567890',
                            'SubId': 'abcdefgh'
                        },
                    },
                },
            };

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ the: 'run response' }))
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}/{SubId}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890',
                subId: 'abcdefgh'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                type: 'MSISDN',
                id: '1234567890',
                subId: 'abcdefgh'
            });

            // response
            expect(mockContext.response.status).toBe(200);
            expect(mockContext.response.body).toEqual({ the: 'run response' });
        });

        test('error flow', async() => {
            const mockContext = {
                request: {},
                response: {},
                state: {
                    conf: {},
                    wso2: 'mocked wso2',
                    logger: mockLogger({ app: 'outbound-api-handlers-test'}),
                    cache: { the: 'mocked cache' },
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '1234567890',
                            'SubId': 'abcdefgh'
                        },
                    },
                },
            };

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ errorInformation: { Iam: 'the-error'} }))
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}/{SubId}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890',
                subId: 'abcdefgh'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                type: 'MSISDN',
                id: '1234567890',
                subId: 'abcdefgh'
            });

            // response
            expect(mockContext.response.status).toBe(404);
            expect(mockContext.response.body).toEqual({ errorInformation: { Iam: 'the-error'} });
        });
    });
    describe('GET /parties/{Type}/{ID}', () => {
        const mockContext = {
            request: {},
            response: {},
            state: {
                conf: {},
                wso2: 'mocked wso2',
                logger: mockLogger({ app: 'outbound-api-handlers-test'}),
                cache: {
                    subscribe: jest.fn(() => Promise.resolve())
                },
                path: {
                    params: {
                        'Type': 'MSISDN',
                        'ID': '1234567890'
                    },
                },
            },
        };
        test('happy flow', async() => {


            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ the: 'run response' }))
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({ type: 'MSISDN', id: '1234567890', subId: undefined });

            // response
            expect(mockContext.response.status).toBe(200);
            expect(mockContext.response.body).toEqual({ the: 'run response' });
        });

        test('not found error flow', async() => {

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ errorInformation: { Iam: 'the-error'} }))
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                type: 'MSISDN',
                id: '1234567890',
                subId: undefined
            });

            // response
            expect(mockContext.response.status).toBe(404);
            expect(mockContext.response.body).toEqual({ errorInformation: { Iam: 'the-error'} });
        });

        test('mojaloop error propagation for /parties/{Type}/{ID}', async() => {

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => { throw mockGetPartiesError; })
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                type: 'MSISDN',
                id: '1234567890',
                subId: undefined
            });

            // response
            expect(mockContext.response.status).toBe(500);
            expect(mockContext.response.body).toEqual({
                message: 'Mock error',
                statusCode: '500',
                requestPartiesInformationState: {}
            });
        });
        test('mojaloop error propagation for /parties/{Type}/{ID}/{SubId}', async() => {

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => { throw mockGetPartiesError; })
            };

            const createSpy = jest.spyOn(PartiesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/parties/{Type}/{ID}/{SubId}'].get(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = PartiesModel.channelName({
                type: 'MSISDN',
                id: '1234567890'
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                type: 'MSISDN',
                id: '1234567890',
                subId: undefined
            });

            // response
            expect(mockContext.response.status).toBe(500);
            expect(mockContext.response.body).toEqual({
                message: 'Mock error',
                statusCode: '500',
                requestPartiesInformationState: {}
            });
        });
    });

    describe('POST /quotes', () => {
        const mockContext = {
            request: {
                body: {
                    fspId: uuid(),
                    quotesPostRequest: {
                        quoteId: uuid()
                    }
                }
            },
            response: {},
            state: {
                conf: {},
                wso2: 'mocked wso2',
                logger: mockLogger({ app: 'outbound-api-handlers-test' }),
                cache: {
                    subscribe: jest.fn(() => Promise.resolve())
                }
            },
        };
        test('happy flow', async () => {


            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ the: 'run response' }))
            };

            const createSpy = jest.spyOn(QuotesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/quotes'].post(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = QuotesModel.channelName({
                quoteId: mockContext.request.body.quotesPostRequest.quoteId
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                quoteId: mockContext.request.body.quotesPostRequest.quoteId,
                fspId: mockContext.request.body.fspId,
                quote: mockContext.request.body.quotesPostRequest
            });

            // response
            expect(mockContext.response.status).toBe(200);
            expect(mockContext.response.body).toEqual({ the: 'run response' });
        });

        test('mojaloop error propagation for /parties/{Type}/{ID}', async() => {

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => { throw { mocked: 'error' }; })
            };

            const createSpy = jest.spyOn(QuotesModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/quotes'].post(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = QuotesModel.channelName({
                quoteId: mockContext.request.body.quotesPostRequest.quoteId
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                quoteId: mockContext.request.body.quotesPostRequest.quoteId,
                fspId: mockContext.request.body.fspId,
                quote: mockContext.request.body.quotesPostRequest
            });

            // response
            expect(mockContext.response.status).toBe(500);
            expect(mockContext.response.body).toEqual({
                message: 'Unspecified error',
                requestQuotesInformationState: {},
                statusCode: '500',
            });
        });
    });
    describe('POST /simpleTransfers', () => {
        const mockContext = {
            request: {
                body: {
                    fspId: uuid(),
                    transfersPostRequest: {
                        transferId: uuid()
                    }
                }
            },
            response: {},
            state: {
                conf: {},
                wso2: 'mocked wso2',
                logger: mockLogger({ app: 'outbound-api-handlers-test' }),
                cache: {
                    subscribe: jest.fn(() => Promise.resolve())
                }
            },
        };
        test('happy flow', async () => {


            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => ({ the: 'run response' }))
            };

            const createSpy = jest.spyOn(TransfersModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/simpleTransfers'].post(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = TransfersModel.channelName({
                transferId: mockContext.request.body.transfersPostRequest.transferId
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                transferId: mockContext.request.body.transfersPostRequest.transferId,
                fspId: mockContext.request.body.fspId,
                transfer: mockContext.request.body.transfersPostRequest
            });

            // response
            expect(mockContext.response.status).toBe(200);
            expect(mockContext.response.body).toEqual({ the: 'run response' });
        });

        test('mojaloop error propagation for /simpleTransfers', async() => {

            // mock state machine
            const mockedPSM = {
                run: jest.fn(async () => { throw { mocked: 'error' }; })
            };

            const createSpy = jest.spyOn(TransfersModel, 'create')
                .mockImplementationOnce(async () => mockedPSM);

            // invoke handler
            await handlers['/simpleTransfers'].post(mockContext);

            // PSM model creation
            const state = mockContext.state;
            const cacheKey = TransfersModel.channelName({
                transferId: mockContext.request.body.transfersPostRequest.transferId
            });
            const expectedConfig = {
                cache: state.cache,
                logger: state.logger,
                wso2: state.wso2
            };
            expect(createSpy).toHaveBeenCalledWith({}, cacheKey, expectedConfig);

            // run workflow
            expect(mockedPSM.run).toHaveBeenCalledWith({
                transferId: mockContext.request.body.transfersPostRequest.transferId,
                fspId: mockContext.request.body.fspId,
                transfer: mockContext.request.body.transfersPostRequest
            });

            // response
            expect(mockContext.response.status).toBe(500);
            expect(mockContext.response.body).toEqual({
                message: 'Unspecified error',
                requestSimpleTransfersInformationState: {},
                statusCode: '500',
            });
        });
    });
});
