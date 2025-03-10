/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Vassilis Barzokas - vassilis.barzokas@modusbox.com               *
 **************************************************************************/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.mock('~/lib/model');

const FSPIOPTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.TransferState;
const handlers = require('~/InboundServer/handlers');
const Model = require('~/lib/model').InboundTransfersModel;
const QuotesModel = require('~/lib/model').QuotesModel;
const PartiesModel = require('~/lib/model').PartiesModel;
const TransfersModel = require('~/lib/model').TransfersModel;
const { logger } = require('~/lib/logger');

const mockArguments = require('./data/mockArguments');
const mockTransactionRequestData = require('./data/mockTransactionRequest');

describe('Inbound API handlers:', () => {
    let mockArgs;
    let mockTransactionRequest;

    beforeEach(() => {
        mockArgs = JSON.parse(JSON.stringify(mockArguments));
        mockTransactionRequest = JSON.parse(JSON.stringify(mockTransactionRequestData));
    });

    describe('POST /quotes', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.quoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger
                }
            };

        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await expect(handlers['/quotes'].post(mockContext)).resolves.toBe(undefined);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toStrictEqual(mockContext.request);
            expect(quoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });


    });

    describe('GET /quotes', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                }
            };

        });

        test('calls `model.getQuoteRequest` with the expected arguments.', async () => {
            const getQuoteRequestSpy = jest.spyOn(Model.prototype, 'getQuoteRequest');

            await expect(handlers['/quotes/{ID}'].get(mockContext)).resolves.toBe(undefined);

            expect(getQuoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(getQuoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);

        });
    });

    describe('PUT /quotes', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `QuotesModel.triggerDeferredJobSpy` with the expected arguments.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(QuotesModel, 'triggerDeferredJob');

            await expect(handlers['/quotes/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                    originalIso20022QuoteResponse: expect.anything()
                },
                args: {
                    quoteId: mockContext.state.path.params.ID
                }
            });
        });
    });

    describe('POST /bulkQuotes', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.bulkQuoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger,
                }
            };

        });

        test('calls `model.bulkQuoteRequest` with the expected arguments.', async () => {
            const bulkQuoteRequestSpy = jest.spyOn(Model.prototype, 'bulkQuoteRequest');

            await expect(handlers['/bulkQuotes'].post(mockContext)).resolves.toBe(undefined);

            expect(bulkQuoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(bulkQuoteRequestSpy.mock.calls[0][0]).toMatchObject(mockContext.request.body);
            expect(bulkQuoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });

    describe('PUT /bulkQuotes/{ID}', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: mockArgs.bulkQuotePutRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const bulkQuotesSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/bulkQuotes/{ID}'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(bulkQuotesSpy).toHaveBeenCalledTimes(1);
            expect(bulkQuotesSpy.mock.calls[0][1]).toMatchObject({
                type: 'bulkQuoteResponse',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('PUT /bulkQuotes/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: {
                        errorInformation: {
                            errorCode: '5100',
                            errorDescription: 'Fake error'
                        }
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const bulkQuotesSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/bulkQuotes/{ID}/error'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(bulkQuotesSpy).toHaveBeenCalledTimes(1);
            expect(bulkQuotesSpy.mock.calls[0][1]).toMatchObject({
                type: 'bulkQuoteResponseError',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('GET /bulkQuotes/{ID}', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                }
            };
        });

        test('calls `model.getBulkQuote` with the expected arguments.', async () => {
            const bulkQuotesSpy = jest.spyOn(Model.prototype, 'getBulkQuote');

            await expect(handlers['/bulkQuotes/{ID}'].get(mockContext)).resolves.toBe(undefined);

            expect(bulkQuotesSpy).toHaveBeenCalledTimes(1);
            expect(bulkQuotesSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });

    describe('POST /bulkTransfers', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.bulkTransferRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger,
                }
            };

        });

        test('calls `model.prepareBulkTransfer` with the expected arguments.', async () => {
            const bulkTransferRequestSpy = jest.spyOn(Model.prototype, 'prepareBulkTransfer');

            await expect(handlers['/bulkTransfers'].post(mockContext)).resolves.toBe(undefined);

            expect(bulkTransferRequestSpy).toHaveBeenCalledTimes(1);
            expect(bulkTransferRequestSpy.mock.calls[0][0]).toMatchObject(mockContext.request.body);
            expect(bulkTransferRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });

    describe('PUT /bulkTransfers/{ID}', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: mockArgs.bulkTransferPutRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const bulkTransfersSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/bulkTransfers/{ID}'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(bulkTransfersSpy).toHaveBeenCalledTimes(1);
            expect(bulkTransfersSpy.mock.calls[0][1]).toMatchObject({
                type: 'bulkTransferResponse',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('PUT /bulkTransfers/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: {
                        errorInformation: {
                            errorCode: '5100',
                            errorDescription: 'Fake error'
                        }
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const bulkTransfersSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/bulkTransfers/{ID}/error'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(bulkTransfersSpy).toHaveBeenCalledTimes(1);
            expect(bulkTransfersSpy.mock.calls[0][1]).toMatchObject({
                type: 'bulkTransferResponseError',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('PUT /transactionRequests/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: {
                        errorInformation: {
                            errorCode: '5100',
                            errorDescription: 'Fake error'
                        }
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '4d99aeb4-e198-4398-b644-eb4ba42530cd'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const putTransactionRequestsByIdErrorSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/transactionRequests/{ID}/error'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(putTransactionRequestsByIdErrorSpy).toHaveBeenCalledTimes(1);
            expect(putTransactionRequestsByIdErrorSpy.mock.calls[0][1]).toMatchObject({
                type: 'transactionRequestResponseError',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('GET /bulkTransfers/{ID}', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                }
            };
        });

        test('calls `model.getBulkTransfer` with the expected arguments.', async () => {
            const bulkTransfersSpy = jest.spyOn(Model.prototype, 'getBulkTransfer');

            await expect(handlers['/bulkTransfers/{ID}'].get(mockContext)).resolves.toBe(undefined);

            expect(bulkTransfersSpy).toHaveBeenCalledTimes(1);
            expect(bulkTransfersSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });

    describe('POST /transactionRequests', () => {

        let mockTransactionReqContext;

        beforeEach(() => {
            mockTransactionReqContext = {
                request: {
                    body: mockTransactionRequest.transactionRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger,
                }
            };
        });

        test('calls `model.transactionRequest` with the expected arguments.', async () => {
            const transactionRequestSpy = jest.spyOn(Model.prototype, 'transactionRequest');

            await expect(handlers['/transactionRequests'].post(mockTransactionReqContext)).resolves.toBe(undefined);

            expect(transactionRequestSpy).toHaveBeenCalledTimes(1);
            expect(transactionRequestSpy.mock.calls[0][0]).toMatchObject(mockTransactionReqContext.request.body);
            expect(transactionRequestSpy.mock.calls[0][1]).toBe(mockTransactionReqContext.request.headers['fspiop-source']);
        });
    });

    describe('GET /authorizations', () => {

        let mockAuthorizationContext;

        beforeEach(() => {

            mockAuthorizationContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path : {
                        params : {
                            'ID': '1234'
                        }
                    },
                    logger,
                }
            };
        });

        test('calls `model.authorizations` with the expected arguments.', async () => {
            const authorizationsSpy = jest.spyOn(Model.prototype, 'getAuthorizations');

            await expect(handlers['/authorizations/{ID}'].get(mockAuthorizationContext)).resolves.toBe(undefined);

            expect(authorizationsSpy).toHaveBeenCalledTimes(1);
            expect(authorizationsSpy.mock.calls[0][1]).toBe(mockAuthorizationContext.request.headers['fspiop-source']);
        });
    });

    describe('PATCH /transfers/{ID}', () => {
        let mockNotificationMessage;

        beforeEach(() => {
            mockNotificationMessage = {
                request: {
                    headers: {

                    },
                    body: {
                        transferState: FSPIOPTransferStateEnum.COMMITTED,
                        completedTimestamp: '2020-08-18T09:39:33.552Z'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234'
                        }
                    },
                    logger,
                }
            };
        });

        test('calls `model.sendNotificationToPayee with expected arguments', async () => {
            const notificationSpy = jest.spyOn(Model.prototype, 'sendNotificationToPayee');

            await expect(handlers['/transfers/{ID}'].patch(mockNotificationMessage)).resolves.toBe(undefined);
            expect(notificationSpy).toHaveBeenCalledTimes(1);
            expect(notificationSpy.mock.calls[0][1]).toBe(mockNotificationMessage.state.path.params.ID);
        });

    });

    describe('PUT /parties/{Type}/{ID}[/{SubId}]', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `PartiesModel.triggerDeferredJobSpy` with the expected arguments.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(PartiesModel, 'triggerDeferredJob');

            await expect(handlers['/parties/{Type}/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    type: mockContext.state.path.params.Type,
                    id: mockContext.state.path.params.ID
                }
            });
        });

        test('calls `PartiesModel.triggerDeferredJobSpy` with the expected arguments when SubId param specified.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(PartiesModel, 'triggerDeferredJob');

            // add extra parameter
            mockContext.state.path.params.SubId = 'sub-id';

            await expect(handlers['/parties/{Type}/{ID}/{SubId}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    type: mockContext.state.path.params.Type,
                    id: mockContext.state.path.params.ID,
                    subId: mockContext.state.path.params.SubId
                }
            });
        });
    });

    describe('PUT /transfers/{ID}', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `TransfersModel.triggerDeferredJobSpy` with the expected arguments.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(TransfersModel, 'triggerDeferredJob');

            await expect(handlers['/transfers/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    transferId: mockContext.state.path.params.ID
                }
            });
        });

        test('calls `TransfersModel.triggerDeferredJobSpy` with the expected arguments when SubId param specified.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(TransfersModel, 'triggerDeferredJob');

            await expect(handlers['/transfers/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    transferId: mockContext.state.path.params.ID,
                }
            });
        });
    });

    describe('PUT /transfers/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `TransfersModel.triggerDeferredJobSpy` with the expected arguments.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(TransfersModel, 'triggerDeferredJob');

            await expect(handlers['/transfers/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    transferId: mockContext.state.path.params.ID
                }
            });
        });

        test('calls `TransfersModel.triggerDeferredJobSpy` with the expected arguments when SubId param specified.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(TransfersModel, 'triggerDeferredJob');

            await expect(handlers['/transfers/{ID}/error'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    transferId: mockContext.state.path.params.ID,
                }
            });
        });
    });

    describe('POST /fxQuotes', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.fxQuoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger,
                }
            };

        });

        test('calls `model.fxQuoteRequest` with the expected arguments.', async () => {
            const fxQuoteRequestSpy = jest.spyOn(Model.prototype, 'postFxQuotes').mockReturnValue(Promise.resolve({ data: {} }));

            await expect(handlers['/fxQuotes'].post(mockContext)).resolves.toBe(undefined);

            expect(fxQuoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(fxQuoteRequestSpy.mock.calls[0][0]).toStrictEqual(mockContext.request);
            expect(fxQuoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });


    });

    describe('PUT /fxQuotes/{ID}', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const putFxQuotesByIdSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/fxQuotes/{ID}'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(putFxQuotesByIdSpy).toHaveBeenCalledTimes(1);
            expect(putFxQuotesByIdSpy.mock.calls[0][1]).toMatchObject({
                type: 'fxQuotesResponse',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('PUT /fxQuotes/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: {
                        errorInformation: {
                            errorCode: '5100',
                            errorDescription: 'Fake error'
                        }
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const putFxQuotesByIdErrorSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/fxQuotes/{ID}/error'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(putFxQuotesByIdErrorSpy).toHaveBeenCalledTimes(1);
            expect(putFxQuotesByIdErrorSpy.mock.calls[0][1]).toMatchObject({
                type: 'fxQuotesResponseError',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('POST /fxTransfers', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.fxTransfersRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger,
                }
            };

        });

        test('calls `model.postFxTransfers` with the expected arguments.', async () => {
            const postFxTransfersSpy = jest.spyOn(Model.prototype, 'postFxTransfers').mockReturnValue(Promise.resolve({ data: {} }));

            await expect(handlers['/fxTransfers'].post(mockContext)).resolves.toBe(undefined);

            expect(postFxTransfersSpy).toHaveBeenCalledTimes(1);
            expect(postFxTransfersSpy.mock.calls[0][0]).toStrictEqual(mockContext.request);
            expect(postFxTransfersSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });


    });

    describe('PUT /fxTransfers/{ID}', () => {

        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: { the: 'mocked-body' },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const putFxTransfersByIdSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/fxTransfers/{ID}'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(putFxTransfersByIdSpy).toHaveBeenCalledTimes(1);
            expect(putFxTransfersByIdSpy.mock.calls[0][1]).toMatchObject({
                type: 'fxTransfersResponse',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });

    describe('PATCH /fxTransfers/{ID}', () => {
        let mockNotificationMessage;

        beforeEach(() => {
            mockNotificationMessage = {
                request: {
                    headers: {

                    },
                    body: {
                        transferState: FSPIOPTransferStateEnum.COMMITTED,
                        completedTimestamp: '2020-08-18T09:39:33.552Z'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234'
                        }
                    },
                    logger,
                }
            };
        });

        test('calls `model.sendFxPatchNotificationToBackend with expected arguments', async () => {
            const notificationSpy = jest.spyOn(Model.prototype, 'sendFxPatchNotificationToBackend');

            await expect(handlers['/fxTransfers/{ID}'].patch(mockNotificationMessage)).resolves.toBe(undefined);
            expect(notificationSpy).toHaveBeenCalledTimes(1);
            expect(notificationSpy.mock.calls[0][1]).toBe(mockNotificationMessage.state.path.params.ID);
        });

    });

    describe('PUT /fxTransfers/{ID}/error', () => {

        let mockContext;

        beforeEach(() => {

            mockContext = {
                request: {
                    body: {
                        errorInformation: {
                            errorCode: '5100',
                            errorDescription: 'Fake error'
                        }
                    },
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'ID': '1234567890'
                        }
                    },
                    logger,
                    cache: {
                        publish: async () => Promise.resolve(true)
                    }
                }
            };
        });

        test('calls `ctx.state.cache.publish` with the expected arguments.', async () => {
            const putFxTransfersByIdErrorSpy = jest.spyOn(mockContext.state.cache, 'publish');

            await expect(handlers['/fxTransfers/{ID}/error'].put(mockContext)).resolves.toBe(undefined);
            expect(mockContext.response.status).toBe(200);
            expect(putFxTransfersByIdErrorSpy).toHaveBeenCalledTimes(1);
            expect(putFxTransfersByIdErrorSpy.mock.calls[0][1]).toMatchObject({
                type: 'fxTransfersResponseError',
                data: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                }
            });
        });
    });
});
