/*************************************************************************
 *  (C) Copyright Mojaloop Foundation. 2024 - All rights reserved.        *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - jbush@mojaloop.io                                   *
 *                                                                        *
 *  CONTRIBUTORS:                                                         *
 *       James Bush - jbush@mojaloop.io                                   *
 *************************************************************************/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.mock('~/lib/model');

const handlers = require('~/InboundServer/handlers');
const Model = require('~/lib/model').InboundTransfersModel;
const QuotesModel = require('~/lib/model').QuotesModel;
const PartiesModel = require('~/lib/model').PartiesModel;
const TransfersModel = require('~/lib/model').TransfersModel;

const mockArguments = require('./data/mockArguments');
const isoBodies = require('./data/isoBodies.json');
const mockTransactionRequestData = require('./data/mockTransactionRequest');
const { Logger } = require('@mojaloop/sdk-standard-components');

// const FSPIOPTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.TransferState;

describe('Inbound API handlers transforming incoming ISO20022 message bodies', () => {
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
                    body: isoBodies.postQuotesRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        apiType: 'iso20222',
                    },
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                }
            };
        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await expect(handlers['/quotes'].post(mockContext)).resolves.toBe(undefined);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toStrictEqual(mockContext.request);
            expect(quoteRequestSpy.mock.calls[0][0]).not.toEqual(isoBodies.postQuotesRequest);
            expect(quoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });

    describe('PUT /quotes', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.putQuotesRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        apiType: 'iso20022',
                    },
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
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    quoteId: mockContext.state.path.params.ID
                }
            });
        });
    });

    describe('PUT /parties/{Type}/{ID}[/{SubId}]', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.putPartiesRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        apiType: 'iso20022',
                    },
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
                message: {
                    body: mockContext.request.body,
                    headers: mockContext.request.headers,
                },
                args: {
                    type: mockContext.state.path.params.Type,
                    id: mockContext.state.path.params.ID
                }
            });
            expect(triggerDeferredJobSpy.mock.calls[0][0].message.body).not.toEqual(isoBodies.postTransfersRequest);
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
            expect(triggerDeferredJobSpy.mock.calls[0][0].message.body).not.toEqual(isoBodies.postTransfersRequest);
        });
    });

    describe('POST /transfers', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.postTransfersRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        apiType: 'iso20022',
                    },
                    logger: new Logger.Logger({ context: { app: 'inbound-handlers-unit-test' }, stringify: () => '' }),
                    cache: {
                        publish: jest.fn(() => Promise.resolve(true))
                    }
                }
            };

        });

        test('calls `prepareTransfer` with the expected arguments.', async () => {
            const transferRequestSpy = jest.spyOn(Model.prototype, 'prepareTransfer');

            await expect(handlers['/transfers'].post(mockContext)).resolves.toBe(undefined);

            expect(transferRequestSpy).toHaveBeenCalledTimes(1);
            expect(transferRequestSpy.mock.calls[0][0]).not.toBeUndefined();
            expect(transferRequestSpy.mock.calls[0][0]).not.toEqual(isoBodies.postTransfersRequest);
        });
    });

    describe('PUT /transfers/{ID}', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.putTransfersRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {
                        apiType: 'iso20022',
                    },
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
            expect(triggerDeferredJobSpy.mock.calls[0][0].message).not.toBeUndefined();
            expect(triggerDeferredJobSpy.mock.calls[0][0].message.body).not.toBeUndefined();
            expect(triggerDeferredJobSpy.mock.calls[0][0].message.body).not.toEqual(isoBodies.putTransfersRequest);

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
    });
});
