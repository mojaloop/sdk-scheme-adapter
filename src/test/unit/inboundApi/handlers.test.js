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

jest.mock('@internal/model');

const handlers = require('../../../InboundServer/handlers');
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const mockTransactionRequestData = require('./data/mockTransactionRequest');
const { Logger, Transports } = require('@internal/log');

let logTransports;

describe('Inbound API handlers:', () => {
    let mockArgs;
    let mockTransactionRequest;

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
    });

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
                    logger: new Logger({ context: { app: 'inbound-handlers-unit-test' }, space: 4, transports: logTransports })
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
                    logger: new Logger({ context: { app: 'inbound-handlers-unit-test' }, space: 4, transports: logTransports })
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
                    logger: new Logger({ context: { app: 'inbound-handlers-unit-test' }, space: 4, transports: logTransports })
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
});
