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
const mockBulkQuoteError = require('./data/mockBulkQuoteError');
const mockBulkTransferError = require('./data/mockBulkTransferError');
const mockRequestToPayError = require('./data/mockRequestToPayError');
const mockRequestToPayTransferError = require('./data/mockRequestToPayTransferError');
const transferRequest = require('./data/transferRequest');
const bulkTransferRequest = require('./data/bulkTransferRequest');
const bulkQuoteRequest = require('./data/bulkQuoteRequest');
const requestToPayPayload = require('./data/requestToPay');
const requestToPayTransferRequest = require('./data/requestToPayTransferRequest');

jest.mock('@internal/model');

const handlers = require('../../../OutboundServer/handlers');
const {
    OutboundTransfersModel,
    OutboundBulkTransfersModel,
    OutboundBulkQuotesModel,
    OutboundRequestToPayTransferModel,
    OutboundRequestToPayModel,
} = require('@internal/model');

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
        getBulkTransfer: async () => {
            throw mockBulkTransferError;
        },
        postBulkTransfer: async () => {
            throw mockBulkTransferError;
        }
    };
});

/**
 * Mock the outbound bulk quotes model to simulate throwing errors
 */
OutboundBulkQuotesModel.mockImplementation(() => {
    return {
        postBulkQuote: async () => {
            throw mockBulkQuoteError;
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
                    logger: console
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
                    logger: console
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
                    logger: console
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
                    logger: console
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
                    logger: console
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
                    logger: console
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
                    logger: console
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
