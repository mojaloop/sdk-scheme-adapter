/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Vassilis Barzokas - vassilis.barzokas@modusbox.com               *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/

'use strict';

jest.mock('@internal/model');

const handlers = require('../../../InboundServer/handlers');
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const mockTransactionRequestData = require('./data/mockTransactionRequest');
const mockAuthorizationArguments = require('../lib/model/data/mockAuthorizationArguments.json');
// TODO: decide between logger implementations
const mockLogger = require('../mockLogger');
const { Logger } = require('@mojaloop/sdk-standard-components');
const AuthorizationsModel = require('@internal/model').OutboundAuthorizationsModel;
const ThirdpartyTrxnModelIn = require('@internal/model').InboundThirdpartyTransactionModel;
const ThirdpartyTrxnModelOut = require('@internal/model').OutboundThirdpartyTransactionModel;
const PartiesModel = require('@internal/model').PartiesModel;

describe('Inbound API handlers:', () => {
    let mockArgs;
    let mockTransactionRequest;
    let mockAuthReqArgs;

    beforeEach(() => {
        mockArgs = deepClone(mockArguments);
        mockTransactionRequest = deepClone(mockTransactionRequestData);
        mockAuthReqArgs = deepClone(mockAuthorizationArguments);
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
                }
            };

        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await expect(handlers['/quotes'].post(mockContext)).resolves.toBe(undefined);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy).toHaveBeenCalledWith(
                mockContext.request.body,
                mockContext.request.headers['fspiop-source']);
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
                }
            };
        });

        test('calls `model.transactionRequest` with the expected arguments.', async () => {
            const transactionRequestSpy = jest.spyOn(Model.prototype, 'transactionRequest');

            await expect(handlers['/transactionRequests'].post(mockTransactionReqContext)).resolves.toBe(undefined);

            expect(transactionRequestSpy).toHaveBeenCalledTimes(1);
            expect(transactionRequestSpy).toHaveBeenCalledWith(
                mockTransactionReqContext.request.body,
                mockTransactionReqContext.request.headers['fspiop-source']);
        });
    });

    describe('POST /authorizations', () => {

        let mockAuthorizationContext;

        beforeEach(() => {

            mockAuthorizationContext = {
                request: {
                    body: mockAuthReqArgs.authorizationRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {},
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
                }
            };
        });

        test('calls `ThirdpartyTrxnModelIn.postAuthorizations` with the expected arguments.', async () => {
            const authorizationRequestSpy = jest.spyOn(ThirdpartyTrxnModelIn.prototype, 'postAuthorizations');

            await expect(handlers['/authorizations'].post(mockAuthorizationContext)).resolves.toBe(undefined);
            expect(authorizationRequestSpy).toHaveBeenCalledTimes(1);
            expect(authorizationRequestSpy).toHaveBeenCalledWith(
                mockAuthorizationContext.request.body,
                mockAuthorizationContext.request.headers['fspiop-source']);
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
                    path: {
                        params: {
                            'ID': '1234'
                        }
                    },
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' })
                }
            };
        });

        test('calls `model.authorizations` with the expected arguments.', async () => {
            const authorizationsSpy = jest.spyOn(Model.prototype, 'getAuthorizations');

            await expect(handlers['/authorizations/{ID}'].get(mockAuthorizationContext)).resolves.toBe(undefined);

            expect(authorizationsSpy).toHaveBeenCalledTimes(1);
            expect(authorizationsSpy).toHaveBeenCalledWith(
                mockAuthorizationContext.state.path.params.ID,
                mockAuthorizationContext.request.headers['fspiop-source']);
        });
    });

    describe('PISP PUT /authorizations', () => {

        let mockAuthorizationContext;
        beforeEach(() => {

            mockAuthorizationContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    },
                    body: {
                        the: 'body'
                    }
                },
                response: {},
                state: {
                    conf: {
                        enablePISPMode: true
                    },
                    path: {
                        params: {
                            'ID': '1234'
                        }
                    },
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
                    // there is no need to mock redis but only Cache
                    cache: {
                        publish: jest.fn(() => Promise.resolve())
                    },
                }
            };
        });

        test('calls `model.authorizations` with the expected arguments.', async () => {
            const notificationSpy = jest.spyOn(AuthorizationsModel, 'notificationChannel').mockImplementationOnce(() => 'notification-channel');

            await expect(handlers['/authorizations/{ID}'].put(mockAuthorizationContext)).resolves.toBe(undefined);

            expect(notificationSpy).toHaveBeenCalledTimes(1);
            expect(notificationSpy).toHaveBeenCalledWith('1234');

            const cache = mockAuthorizationContext.state.cache;
            expect(cache.publish).toBeCalledTimes(1);
            expect(cache.publish).toBeCalledWith('notification-channel', {
                type: 'authorizationsResponse',
                data: mockAuthorizationContext.request.body,
                headers: mockAuthorizationContext.request.headers
            });
        });
    });

    describe('DFSP PUT /authorizations', () => {

        let mockAuthorizationContext;
        beforeEach(() => {

            mockAuthorizationContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    },
                    body: {
                        the: 'body'
                    }
                },
                response: {},
                state: {
                    conf: {
                        enablePISPMode: false
                    },
                    path: {
                        params: {
                            'ID': '1234'
                        }
                    },
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
                    // there is no need to mock redis but only Cache
                    cache: {
                        publish: jest.fn(() => Promise.resolve())
                    },
                }
            };
        });

        test('calls `model.authorizations` with the expected arguments.', async () => {

            await expect(handlers['/authorizations/{ID}'].put(mockAuthorizationContext)).resolves.toBe(undefined);

            const cache = mockAuthorizationContext.state.cache;
            expect(cache.publish).toBeCalledTimes(1);
            expect(cache.publish).toBeCalledWith('otp_1234', {
                type: 'authorizationsResponse',
                data: mockAuthorizationContext.request.body,
                headers: mockAuthorizationContext.request.headers
            });
        });
    });

    describe('PUT /thirdpartyRequests/transactions', () => {
        let mockThirdPartyReqContext;
        beforeEach(() => {
            mockThirdPartyReqContext = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    },
                    body: {
                        the: 'body'
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
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
                    cache: {
                        publish: jest.fn(() => Promise.resolve())
                    },
                }
            };
        });

        test('calls `model.thirdpartyRequests.transactions` with the expected arguments.', async () => {
            const pubNotificatiosnSpy = jest.spyOn(ThirdpartyTrxnModelOut, 'publishNotifications');

            await expect(handlers['/thirdpartyRequests/transactions/{ID}'].put(mockThirdPartyReqContext)).resolves.toBe(undefined);

            expect(pubNotificatiosnSpy).toHaveBeenCalledTimes(1);
            expect(pubNotificatiosnSpy).toHaveBeenCalledWith(mockThirdPartyReqContext.state.cache,
                mockThirdPartyReqContext.state.path.params.ID, {
                    type: 'thirdpartyTransactionsReqResponse',
                    data: mockThirdPartyReqContext.request.body,
                    headers: mockThirdPartyReqContext.request.headers
                });
        });
    });

    describe('PUT /parties/{Type}/{ID}', () => {
        let mockPutPartiesCtx;
        beforeEach(() => {
            mockPutPartiesCtx = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    },
                    body: {
                        party: { Iam: 'mocked-party' }
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '123456789'
                        }
                    },
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
                    cache: {
                        publish: jest.fn(() => Promise.resolve())
                    },
                }
            };
        });

        test('calls cache.publish with the expected arguments.', async () => {
            PartiesModel.channelName = jest.fn(() => 'mocked-parties-channel');
            await expect(handlers['/parties/{Type}/{ID}'].put(mockPutPartiesCtx)).resolves.toBe(undefined);
            expect(mockPutPartiesCtx.state.cache.publish).toHaveBeenCalledWith('MSISDN_123456789', {party: { Iam: 'mocked-party' }});
            expect(mockPutPartiesCtx.state.cache.publish).toHaveBeenCalledWith('mocked-parties-channel', {party: { Iam: 'mocked-party' }});
            expect(mockPutPartiesCtx.response.status).toBe(200);
        });
    });

    describe('PUT /parties/{Type}/{ID}/{SubId}', () => {
        let mockPutPartiesCtx;
        beforeEach(() => {
            mockPutPartiesCtx = {
                request: {
                    headers: {
                        'fspiop-source': 'foo'
                    },
                    body: {
                        party: { Iam: 'mocked-party' }
                    }
                },
                response: {},
                state: {
                    conf: {},
                    path: {
                        params: {
                            'Type': 'MSISDN',
                            'ID': '123456789',
                            'SubId': 'abcdefg'
                        }
                    },
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }),
                    cache: {
                        publish: jest.fn(() => Promise.resolve())
                    },
                }
            };
        });

        test('calls cache.publish with the expected arguments.', async () => {
            PartiesModel.channelName = jest.fn(() => 'mocked-parties-channel');
            await expect(handlers['/parties/{Type}/{ID}'].put(mockPutPartiesCtx)).resolves.toBe(undefined);
            expect(mockPutPartiesCtx.state.cache.publish).toHaveBeenCalledWith('MSISDN_123456789_abcdefg', {party: { Iam: 'mocked-party' }});
            expect(mockPutPartiesCtx.state.cache.publish).toHaveBeenCalledWith('mocked-parties-channel', {party: { Iam: 'mocked-party' }});
            expect(mockPutPartiesCtx.response.status).toBe(200);
        });
    });

});

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
