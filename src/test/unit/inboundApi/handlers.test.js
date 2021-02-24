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

jest.mock('../../../lib/model');

const handlers = require('../../../InboundServer/handlers');
const Model = require('../../../lib/model').InboundTransfersModel;
const QuotesModel = require('../../../lib/model').QuotesModel;
const PartiesModel = require('../../../lib/model').PartiesModel;
const TransfersModel = require('../../../lib/model').TransfersModel;
const AuthorizationsModel = require('../../../lib/model').AuthorizationsModel;

const mockArguments = require('./data/mockArguments');
const mockTransactionRequestData = require('./data/mockTransactionRequest');
const { Logger } = require('@mojaloop/sdk-standard-components');

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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                }
            };

        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await expect(handlers['/quotes'].post(mockContext)).resolves.toBe(undefined);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toBe(mockContext.request.body);
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                message: mockContext.request.body,
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                }
            };

        });

        test('calls `model.bulkQuoteRequest` with the expected arguments.', async () => {
            const bulkQuoteRequestSpy = jest.spyOn(Model.prototype, 'bulkQuoteRequest');

            await expect(handlers['/bulkQuotes'].post(mockContext)).resolves.toBe(undefined);

            expect(bulkQuoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(bulkQuoteRequestSpy.mock.calls[0][0]).toBe(mockContext.request.body);
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                data: mockContext.request.body,
                headers: mockContext.request.headers
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                data: mockContext.request.body
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                }
            };

        });

        test('calls `model.prepareBulkTransfer` with the expected arguments.', async () => {
            const bulkTransferRequestSpy = jest.spyOn(Model.prototype, 'prepareBulkTransfer');

            await expect(handlers['/bulkTransfers'].post(mockContext)).resolves.toBe(undefined);

            expect(bulkTransferRequestSpy).toHaveBeenCalledTimes(1);
            expect(bulkTransferRequestSpy.mock.calls[0][0]).toBe(mockContext.request.body);
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                data: mockContext.request.body,
                headers: mockContext.request.headers
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                data: mockContext.request.body
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                }
            };
        });

        test('calls `model.transactionRequest` with the expected arguments.', async () => {
            const transactionRequestSpy = jest.spyOn(Model.prototype, 'transactionRequest');

            await expect(handlers['/transactionRequests'].post(mockTransactionReqContext)).resolves.toBe(undefined);

            expect(transactionRequestSpy).toHaveBeenCalledTimes(1);
            expect(transactionRequestSpy.mock.calls[0][0]).toBe(mockTransactionReqContext.request.body);
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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

    describe('PUT /authorizations', () => {

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
                            'ID': '1234'
                        }
                    },
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    } 
                }
            };

        });

        test('calls `AuthorizationsModel.triggerDeferredJobSpy` with the expected arguments.', async () => {
            const triggerDeferredJobSpy = jest.spyOn(AuthorizationsModel, 'triggerDeferredJob');

            await expect(handlers['/authorizations/{ID}'].put(mockContext)).resolves.toBe(undefined);

            expect(triggerDeferredJobSpy).toHaveBeenCalledTimes(1);
            expect(triggerDeferredJobSpy).toBeCalledWith({
                cache: mockContext.state.cache,
                message: mockContext.request.body,
                args: { 
                    transactionRequestId: mockContext.state.path.params.ID
                }
            });
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
                        transferState: 'COMMITTED',
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                message: mockContext.request.body,
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
                message: mockContext.request.body,
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                message: mockContext.request.body,
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
                message: mockContext.request.body,
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
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
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
                message: mockContext.request.body,
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
                message: mockContext.request.body,
                args: {
                    transferId: mockContext.state.path.params.ID,
                }
            });
        });
    });
});
