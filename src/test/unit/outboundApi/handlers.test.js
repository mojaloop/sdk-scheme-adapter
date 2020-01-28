/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const mockError = require('./data/mockError');
const mockRequestToPayError = require('./data/mockRequestToPayError');
const transferRequest = require('./data/transferRequest');
const requestToPayPayload = require('./data/requestToPay');

jest.mock('@internal/model');

const handlers = require('../../../OutboundServer/handlers');
const { OutboundTransfersModel,OutboundRequestToPayModel } = require('@internal/model');

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
                    logger: console
                }
            };

            await handlers['/transfers'].post(mockContext);

            // check response is correct
            expect(mockContext.response.status).toEqual(500);
            expect(mockContext.response.body).toBeTruthy();
            expect(mockContext.response.body.message).toEqual('Mock error');
            expect(mockContext.response.body.statusCode).toEqual('3204');
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
                    logger: console,
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
                    logger: console
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

});
