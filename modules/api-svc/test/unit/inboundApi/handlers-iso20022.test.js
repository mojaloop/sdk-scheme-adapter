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

jest.mock('../../../src/lib/model');

const handlers = require('../../../src/InboundServer/handlers');
const Model = require('../../../src/lib/model').InboundTransfersModel;
const QuotesModel = require('../../../src/lib/model').QuotesModel;
const PartiesModel = require('../../../src/lib/model').PartiesModel;
const TransfersModel = require('../../../src/lib/model').TransfersModel;
const { logger } = require('../../../src/lib/logger');

const { createIsoHeader } = require('../../helpers');
const isoBodies = require('./data/isoBodies.json');

describe('Inbound API handlers transforming incoming ISO20022 message bodies', () => {
    describe('POST /quotes', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.postQuotesRequest,
                    headers: {
                        'fspiop-source': 'foo',
                        'content-type': createIsoHeader('quotes')
                    }
                },
                response: {},
                state: {
                    conf: {
                        isIsoApi: true,
                    },
                    logger,
                }
            };
        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await expect(handlers['/quotes'].post(mockContext)).resolves.toBe(undefined);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toStrictEqual({
                ...mockContext.request,
                isoPostQuote: isoBodies.postQuotesRequest
            });
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
                        isIsoApi: true,
                    },
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
                        isIsoApi: true,
                    },
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
                        isIsoApi: true,
                    },
                    logger,
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
                        'fspiop-source': 'foo',
                        'content-type': createIsoHeader('transfers')
                    }
                },
                response: {},
                state: {
                    conf: {
                        isIsoApi: true,
                    },
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

    describe('POST /fxQuotes Tests', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.postFxQuotesRequest,
                    headers: {
                        'fspiop-source': 'foo',
                        'content-type': createIsoHeader('fxQuotes'),
                        accept: createIsoHeader('fxQuotes')
                    }
                },
                response: {},
                state: {
                    logger,
                    conf: {
                        isIsoApi: true,
                    },
                    cache: {
                        publish: jest.fn(async () => true)
                    }
                }
            };
        });

        test('should call "postFxQuotes" with the expected arguments.', async () => {
            const fxQuotesRequestSpy = jest.fn(async () => {});
            // jest.spyOn returns undefined, and thus .then() is not a function
            Model.prototype.postFxQuotes = fxQuotesRequestSpy;

            await expect(handlers['/fxQuotes'].post(mockContext)).resolves.toBe(undefined);

            expect(fxQuotesRequestSpy).toHaveBeenCalledTimes(1);
            expect(fxQuotesRequestSpy.mock.calls[0][0]).not.toBeUndefined();
            expect(fxQuotesRequestSpy.mock.calls[0][0]).not.toEqual(isoBodies.postFxQuotesRequest);
        });
    });

    describe('POST /fxTransfers Tests', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: isoBodies.postFxTransfersRequest,
                    headers: {
                        'fspiop-source': 'foo',
                        'content-type': createIsoHeader('fxTransfers')
                    }
                },
                response: {},
                state: {
                    logger,
                    conf: {
                        isIsoApi: true,
                    },
                    cache: {
                        publish: jest.fn(async () => true)
                    }
                }
            };
        });

        test('should call "postFxTransfers" with the expected arguments.', async () => {
            const fxTransfersRequestSpy = jest.fn(async () => {});
            // jest.spyOn returns undefined, and thus .then() is not a function
            Model.prototype.postFxTransfers = fxTransfersRequestSpy;

            await expect(handlers['/fxTransfers'].post(mockContext)).resolves.toBe(undefined);

            expect(fxTransfersRequestSpy).toHaveBeenCalledTimes(1);
            expect(fxTransfersRequestSpy.mock.calls[0][0]).not.toBeUndefined();
            expect(fxTransfersRequestSpy.mock.calls[0][0]).not.toEqual(isoBodies.postFxTransfersRequest);
        });
    });
});
