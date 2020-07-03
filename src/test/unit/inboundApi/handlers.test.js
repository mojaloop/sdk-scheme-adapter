/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Vassilis Barzokas - vassilis.barzokas@modusbox.com               *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

'use strict';

jest.mock('@internal/model');

const handlers = require('../../../InboundServer/handlers');
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const mockTransactionRequestData = require('./data/mockTransactionRequest');
const mockAuthorizationRequestData = require('./data/mockAuthorizationRequest');
const mockLogger = require('../mockLogger');
const AuthorizationsModel = require('@internal/model').OutboundAuthorizationsModel;
const ThirdpartyTrxnModelIn = require('@internal/model').InboundThirdpartyTransactionModel;
const ThirdpartyTrxnModelOut = require('@internal/model').OutboundThirdpartyTransactionModel;


describe('Inbound API handlers:', () => {
    let mockArgs;
    let mockTransactionRequest;
    let mockAuthorizationRequest;

    beforeEach(() => {
        mockArgs = JSON.parse(JSON.stringify(mockArguments));
        mockTransactionRequest = JSON.parse(JSON.stringify(mockTransactionRequestData));
        mockAuthorizationRequest = JSON.parse(JSON.stringify(mockAuthorizationRequestData));
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
                    // example of elaborative logging with keepQuite = false
                    logger: mockLogger({ app: 'inbound-handlers-unit-test' }, false)
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
            expect(transactionRequestSpy.mock.calls[0][0]).toBe(mockTransactionReqContext.request.body);
            expect(transactionRequestSpy.mock.calls[0][1]).toBe(mockTransactionReqContext.request.headers['fspiop-source']);
        });
    });

    describe('POST /authorizations', () => {

        let mockAuthorizationContext;

        beforeEach(() => {

            mockAuthorizationContext = {
                request: {
                    body: mockAuthorizationRequest.authorizationRequest,
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
            expect(authorizationRequestSpy.mock.calls[0][0]).toBe(mockAuthorizationContext.request.body);
            expect(authorizationRequestSpy.mock.calls[0][1]).toBe(mockAuthorizationContext.request.headers['fspiop-source']);
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
            expect(authorizationsSpy.mock.calls[0][1]).toBe(mockAuthorizationContext.request.headers['fspiop-source']);
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

    describe('PUT /thirdPartyRequests/transactions', () => {
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

        test('calls `model.thirdPartyRequests.transactions` with the expected arguments.', async () => {
            const notificationSpy = jest.spyOn(ThirdpartyTrxnModelOut, 'notificationChannel').mockImplementationOnce(() => 'notification-channel');

            await expect(handlers['/thirdPartyRequests/transactions/{ID}'].put(mockThirdPartyReqContext)).resolves.toBe(undefined);

            expect(notificationSpy).toHaveBeenCalledTimes(1);
            expect(notificationSpy).toHaveBeenCalledWith('1234');

            const cache = mockThirdPartyReqContext.state.cache;
            expect(cache.publish).toBeCalledTimes(1);
            expect(cache.publish).toBeCalledWith('notification-channel', {
                type: 'thirdPartyTransactionsReqResponse',
                data: mockThirdPartyReqContext.request.body,
                headers: mockThirdPartyReqContext.request.headers
            });
        });
    });

});
