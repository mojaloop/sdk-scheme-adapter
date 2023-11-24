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

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');
jest.mock('redis');
jest.mock('~/lib/model/lib/requests',() => require('./mockedLibRequests'));

const defaultConfig = require('./data/defaultConfig');
const Model = require('~/lib/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const mockTxnReqquestsArguments = require('./data/mockTxnRequestsArguments');
const { MojaloopRequests, Ilp, Logger } = require('@mojaloop/sdk-standard-components');
const { BackendRequests, HTTPResponseError } = require('~/lib/model/lib/requests');
const Cache = require('~/lib/cache');
const shared = require('~/lib/model/lib/shared');

const getTransfersBackendResponse = require('./data/getTransfersBackendResponse');
const getTransfersMojaloopResponse = require('./data/getTransfersMojaloopResponse');
const getBulkTransfersBackendResponse = require('./data/getBulkTransfersBackendResponse');
const getBulkTransfersMojaloopResponse = require('./data/getBulkTransfersMojaloopResponse');
const notificationToPayee = require('./data/notificationToPayee');
const notificationAbortedToPayee = require('./data/notificationAbortedToPayee');
const notificationReservedToPayee = require('./data/notificationReservedToPayee');

const { SDKStateEnum } = require('../../../../src/lib/model/common');
const FSPIOPTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.TransferState;
const FSPIOPBulkTransferStateEnum = require('@mojaloop/central-services-shared').Enum.Transfers.BulkTransferState;

describe('inboundModel', () => {
    let config;
    let mockArgs;
    let mockTxnReqArgs;
    let logger;

    beforeAll(async () => {
        logger = new Logger.Logger({ context: { app: 'inbound-model-unit-tests' }, stringify: () => '' });
    });

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));

        mockArgs = JSON.parse(JSON.stringify(mockArguments));
        mockArgs.internalQuoteResponse.expiration = new Date(Date.now());
        mockTxnReqArgs = JSON.parse(JSON.stringify(mockTxnReqquestsArguments));
    });

    describe('quoteRequest', () => {
        let expectedQuoteResponseILP;
        let model;
        let cache;

        beforeEach(async () => {
            expectedQuoteResponseILP = Ilp.__response;
            BackendRequests.__postQuoteRequests = jest.fn().mockReturnValue(Promise.resolve(mockArgs.internalQuoteResponse));
            MojaloopRequests.__putQuotes = jest.fn().mockReturnValue(Promise.resolve({
                originalRequest: {
                    headers: {},
                    body: {},
                }
            }));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();

            model = new Model({
                ...config,
                cache,
                logger,
            });
        });

        afterEach(async () => {
            MojaloopRequests.__putQuotes.mockClear();
            await cache.disconnect();
        });

        test('calls `mojaloopRequests.putQuotes` with the expected arguments.', async () => {
            await model.quoteRequest(mockArgs.quoteRequest, mockArgs.fspId);

            expect(BackendRequests.__postQuoteRequests).toHaveBeenCalledTimes(1);
            expect(BackendRequests.__postQuoteRequests.mock.calls[0][0]).toEqual(mockArgs.internalQuoteRequest);

            expect(MojaloopRequests.__putQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].expiration).toBe(mockArgs.internalQuoteResponse.expiration);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);

            // check the extension list gets translated correctly to the mojaloop form
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].extensionList)
                .toStrictEqual(mockArgs.internalQuoteResponse.extensionList);
        });

        test('adds a custom `expiration` property in case it is not defined.', async() => {
            // set a custom mock time in the global Date object in order to avoid race conditions.
            // Make sure to clear it at the end of the test case.
            const currentTime = new Date().getTime();
            const dateSpy = jest.spyOn(Date.prototype, 'getTime').mockImplementation(() => currentTime);
            const expectedExpirationDate = new Date(currentTime + (config.expirySeconds * 1000)).toISOString();

            delete mockArgs.internalQuoteResponse.expiration;

            await model.quoteRequest(mockArgs.quoteRequest, mockArgs.fspId);

            expect(MojaloopRequests.__putQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].expiration).toBe(expectedExpirationDate);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);

            dateSpy.mockClear();
        });


    });

    describe('bulkQuoteRequest', () => {
        let expectedQuoteResponseILP;
        let model;
        let cache;

        beforeEach(async () => {
            // eslint-disable-next-line no-unused-vars
            expectedQuoteResponseILP = Ilp.__response;
            BackendRequests.__postBulkQuotes = jest.fn().mockReturnValue(Promise.resolve(mockArgs.internalBulkQuoteResponse));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();
            // eslint-disable-next-line no-unused-vars
            model = new Model({
                ...config,
                cache,
                logger,
            });
        });

        afterEach(async () => {
            MojaloopRequests.__putBulkQuotes.mockClear();
            await cache.disconnect();
        });

        test('calls mojaloopRequests.putBulkQuotes with the expected arguments.', async () => {
            await model.bulkQuoteRequest(mockArgs.bulkQuoteRequest, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].expiration).toBe(mockArgs.internalBulkQuoteResponse.expiration);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);
        });
        test('adds a custom expiration property in case it is not defined.', async() => {
            // set a custom mock time in the global Date object in order to avoid race conditions.
            // Make sure to clear it at the end of the test case.
            const currentTime = new Date().getTime();
            const dateSpy = jest.spyOn(Date.prototype, 'getTime').mockImplementation(() => currentTime);
            const expectedExpirationDate = new Date(currentTime + (config.expirySeconds * 1000)).toISOString();

            delete mockArgs.internalBulkQuoteResponse.expiration;

            await model.bulkQuoteRequest(mockArgs.bulkQuoteRequest, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].expiration).toBe(expectedExpirationDate);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);

            dateSpy.mockClear();
        });

    });

    describe('transactionRequest', () => {
        let model;
        let cache;

        beforeEach(async () => {
            BackendRequests.__postTransactionRequests = jest.fn().mockReturnValue(Promise.resolve(mockTxnReqArgs.internalTransactionRequestResponse));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();

            model = new Model({
                ...config,
                cache,
                logger,
            });
        });

        afterEach(async () => {
            MojaloopRequests.__putTransactionRequests.mockClear();
            await cache.disconnect();
        });

        test('calls `mojaloopRequests.putTransactionRequests` with the expected arguments.', async () => {
            await model.transactionRequest(mockTxnReqArgs.transactionRequest, mockTxnReqArgs.fspId);

            expect(MojaloopRequests.__putTransactionRequests).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putTransactionRequests.mock.calls[0][1].transactionRequestState).toBe(mockTxnReqArgs.internalTransactionRequestResponse.transactionRequestState);

        });


    });

    describe('authorizations', () => {
        let model;
        let cache;

        beforeEach(async () => {
            BackendRequests.__getOTP = jest.fn().mockReturnValue(Promise.resolve(mockArgs.internalGetOTPResponse));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();

            model = new Model({
                ...config,
                cache,
                logger,
            });
        });

        afterEach(async () => {
            MojaloopRequests.__putAuthorizations.mockClear();
            await cache.disconnect();
        });

        test('calls `mojaloopRequests.putAuthorizations` with the expected arguments.', async () => {
            await model.getAuthorizations('123456', mockTxnReqArgs.fspId);

            expect(MojaloopRequests.__putAuthorizations).toHaveBeenCalledTimes(1);

        });


    });

    describe('transferPrepare:', () => {
        let cache;

        beforeEach(async () => {
            MojaloopRequests.__putTransfersError.mockClear();
            BackendRequests.__postTransfers = jest.fn().mockReturnValue(Promise.resolve({}));
            MojaloopRequests.__putTransfers = jest.fn().mockReturnValue(Promise.resolve({
                originalRequest: {
                    headers: {},
                    body: {},
                }
            }));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();
        });

        afterEach(async () => {
            await cache.disconnect();
        });

        test('fail on quote `expiration` deadline.', async () => {
            const TRANSFER_ID = 'fake-transfer-id';
            const model = new Model({
                ...config,
                cache,
                logger,
                rejectTransfersOnExpiredQuotes: true,
            });
            cache.set(`transferModel_in_${TRANSFER_ID}`, {
                transferId: TRANSFER_ID,
                quote: {
                    mojaloopResponse: {
                        expiration: new Date(new Date().getTime() - 1000).toISOString(),
                    }
                }
            });
            const args = {
                body: {
                    transferId: TRANSFER_ID,
                }
            };

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putTransfersError.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('3302');
        });

        test('getTransfer should return COMMITTED transfer', async () => {
            const TRANSFER_ID = 'fake-transfer-id';

            const backendResponse = JSON.parse(JSON.stringify(getTransfersBackendResponse));
            backendResponse.to.fspId = config.dfspId;
            BackendRequests.__getTransfers = jest.fn().mockReturnValue(Promise.resolve(backendResponse));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getTransfer(TRANSFER_ID, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfers).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putTransfers.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1]).toEqual(getTransfersMojaloopResponse);
            expect(call[1].transferState).toEqual(FSPIOPTransferStateEnum.COMMITTED);
        });

        test('getTransfer should not return fulfillment from payer', async () => {
            const TRANSFER_ID = 'fake-transfer-id';

            const backendResponse = JSON.parse(JSON.stringify(getTransfersBackendResponse));
            backendResponse.to.fspId = 'payer-dfsp';
            BackendRequests.__getTransfers = jest.fn().mockReturnValue(Promise.resolve(backendResponse));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getTransfer(TRANSFER_ID, mockArgs.fspId);

            const call = MojaloopRequests.__putTransfers.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1]).toEqual({...getTransfersMojaloopResponse, fulfilment: undefined});
            expect(call[1].transferState).toEqual(FSPIOPTransferStateEnum.COMMITTED);
        });

        test('getTransfer should return not found error', async () => {
            const TRANSFER_ID = 'fake-transfer-id';

            BackendRequests.__getTransfers = jest.fn().mockReturnValue(
                Promise.reject(new HTTPResponseError({
                    res: {
                        data: {
                            statusCode: '3208'
                        },
                    }
                })));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getTransfer(TRANSFER_ID, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putTransfersError.mock.calls[0];
            expect(call[0]).toEqual(`${TRANSFER_ID}`);
            expect(call[1].errorInformation.errorCode).toEqual('3208');
        });

        test('fail on transfer without quote.', async () => {
            const TRANSFER_ID = 'without_quote-transfer-id';
            const args = {
                body: {
                    transferId: TRANSFER_ID,
                    amount: {
                        currency: 'USD',
                        amount: 20.13
                    },
                    ilpPacket: 'mockBase64encodedIlpPacket',
                    condition: 'mockGeneratedCondition'
                }
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                allowTransferWithoutQuote: false,
            });

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putTransfersError.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('2001');
        });

        test('stores homeTransactionId in cache when received by dfsp acting as payee', async () => {
            const TRANSFER_ID = 'transfer-id';
            const HOME_TRANSACTION_ID = 'mockHomeTransactionId';
            shared.mojaloopPrepareToInternalTransfer = jest.fn().mockReturnValueOnce({});

            // mock response from dfsp acting as payee
            BackendRequests.__postTransfers = jest.fn().mockReturnValueOnce(Promise.resolve({
                homeTransactionId: HOME_TRANSACTION_ID,
                transferId: TRANSFER_ID
            }));

            const args = {
                body: {
                    transferId: TRANSFER_ID,
                    amount: {
                        currency: 'USD',
                        amount: 20.13
                    },
                    ilpPacket: 'mockBase64encodedIlpPacket',
                    condition: 'mockGeneratedCondition'
                }
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                checkIlp: false,
                rejectTransfersOnExpiredQuotes: false
            });

            cache.set(`transferModel_in_${TRANSFER_ID}`, {
                transferId: TRANSFER_ID,
                quote: {
                    fulfilment: 'mockFulfilment',
                    mojaloopResponse: {
                        condition: 'mockCondition',
                    }
                }
            });

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(0);
            expect(BackendRequests.__postTransfers).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putTransfers).toHaveBeenCalledTimes(1);
            expect((await cache.get(`transferModel_in_${TRANSFER_ID}`)).homeTransactionId)
                .toEqual(HOME_TRANSACTION_ID);
        });

        test('pass on transfer without quote.', async () => {
            const TRANSFER_ID = 'without_quote-transfer-id';
            cache.set(`transferModel_in_${TRANSFER_ID}`, {
                fulfilment: '',
                mojaloopResponse: {
                    response: ''
                },
                quote: null
            });

            const args = {
                body: {
                    transferId: TRANSFER_ID,
                    amount: {
                        currency: 'USD',
                        amount: 20.13
                    },
                    ilpPacket: 'mockBase64encodedIlpPacket',
                    condition: 'mockGeneratedCondition'
                }
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                allowTransferWithoutQuote: true,
            });

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(0);
            expect(BackendRequests.__postTransfers).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putTransfers).toHaveBeenCalledTimes(1);
        });

        test('allow different transfer and transaction id', async () => {
            const transactionId = 'mockTransactionId';
            const TRANSFER_ID = 'transfer-id';
            shared.mojaloopPrepareToInternalTransfer = jest.fn().mockReturnValueOnce({});

            cache.set(`transferModel_in_${transactionId}`, {
                fulfilment: '',
                mojaloopResponse: {
                    response: ''
                },
                quote: {
                    fulfilment: 'mockFulfilment',
                    mojaloopResponse: {
                        condition: 'mockCondition',
                    }
                }
            });

            const args = {
                body: {
                    transferId: TRANSFER_ID,
                    amount: {
                        currency: 'USD',
                        amount: 20.13
                    },
                    ilpPacket: 'mockIlpPacket',
                    condition: 'mockGeneratedCondition'
                }
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                allowDifferentTransferTransactionId: true,
                checkIlp: false,
            });

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(0);
            expect(BackendRequests.__postTransfers).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putTransfers).toHaveBeenCalledTimes(1);
        });
    });

    describe('prepareBulkTransfer:', () => {
        let cache;

        beforeEach(async () => {
            MojaloopRequests.__putBulkTransfersError.mockClear();
            MojaloopRequests.__putBulkTransfers = jest.fn().mockReturnValue(Promise.resolve({}));
            BackendRequests.__postBulkTransfers = jest.fn().mockReturnValue(Promise.resolve({}));

            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();
        });

        afterEach(async () => {
            await cache.disconnect();
        });

        test('fail on bulk quote `expiration` deadline.', async () => {
            const BULK_TRANSFER_ID = 'fake-bulk-transfer-id';
            const BULK_QUOTE_ID = 'fake-bulk-quote-id';
            const model = new Model({
                ...config,
                cache,
                logger,
                rejectTransfersOnExpiredQuotes: true,
            });
            cache.set(`bulkQuotes_${BULK_QUOTE_ID}`, {
                mojaloopResponse: {
                    expiration: new Date(new Date().getTime() - 1000).toISOString(),
                    individualQuoteResults: [],
                }
            });
            const args = {
                bulkTransferId: BULK_TRANSFER_ID,
                bulkQuoteId: BULK_QUOTE_ID,
                individualTransfers: [],
            };

            await model.prepareBulkTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putBulkTransfersError.mock.calls[0];
            expect(call[0]).toEqual(BULK_TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('3302');
        });

        test('getBulkTransfer should return COMMITTED bulk transfer', async () => {
            const BULK_TRANSFER_ID = 'fake-bulk-transfer-id';

            const backendResponse = JSON.parse(JSON.stringify(getBulkTransfersBackendResponse));
            BackendRequests.__getBulkTransfers = jest.fn().mockReturnValue(Promise.resolve(backendResponse));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getBulkTransfer(BULK_TRANSFER_ID, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkTransfers).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putBulkTransfers.mock.calls[0];
            expect(call[0]).toEqual(BULK_TRANSFER_ID);
            expect(call[1]).toEqual(getBulkTransfersMojaloopResponse);
            expect(call[1].bulkTransferState).toEqual(FSPIOPBulkTransferStateEnum.COMPLETED);
        });

        test('getBulkTransfer should not return fulfillment from payer', async () => {
            const BULK_TRANSFER_ID = 'fake-bulk-transfer-id';

            const backendResponse = JSON.parse(JSON.stringify(getBulkTransfersBackendResponse));
            backendResponse.internalRequest.individualTransfers[0].to.fspId = 'payer-dfsp';
            BackendRequests.__getBulkTransfers = jest.fn().mockReturnValue(Promise.resolve(backendResponse));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getBulkTransfer(BULK_TRANSFER_ID, mockArgs.fspId);

            const call = MojaloopRequests.__putBulkTransfers.mock.calls[0];
            expect(call[0]).toEqual(BULK_TRANSFER_ID);
            expect(call[1].bulkTransferState).toEqual(FSPIOPBulkTransferStateEnum.COMPLETED);
            const expectedResponse = {...getBulkTransfersMojaloopResponse};
            expectedResponse.individualTransferResults[0].fulfilment = undefined;
            expect(call[1]).toMatchObject(expectedResponse);
        });

        test('getBulkTransfer should return not found error', async () => {
            const BULK_TRANSFER_ID = 'fake-bulk-transfer-id';

            BackendRequests.__getBulkTransfers = jest.fn().mockReturnValue(
                Promise.reject(new HTTPResponseError({
                    res: {
                        data: {
                            statusCode: '3208'
                        },
                    }
                })));

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.getBulkTransfer(BULK_TRANSFER_ID, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putBulkTransfersError.mock.calls[0];
            expect(call[0]).toEqual(`${BULK_TRANSFER_ID}`);
            expect(call[1].errorInformation.errorCode).toEqual('3208');
        });

        test('fail on bulk transfer without bulk quote.', async () => {
            const BULK_TRANSFER_ID = 'without_bulk-quote-bulk-transfer-id';
            const args = {
                bulkTransferId: BULK_TRANSFER_ID,
                ilpPacket: 'mockBase64encodedIlpPacket',
                condition: 'mockGeneratedCondition',
                individualTransfers: [
                    {
                        amount: {
                            currency: 'USD',
                            amount: 20.13
                        },
                    }
                ]
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                allowTransferWithoutQuote: false,
            });

            await model.prepareBulkTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putBulkTransfersError.mock.calls[0];
            expect(call[0]).toEqual(BULK_TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('2001');
        });

        test('pass on bulk transfer without bulk quote.', async () => {
            const BULK_TRANSFER_ID = 'without_bulk-quote-bulk-transfer-id';
            const args = {
                bulkTransferId: BULK_TRANSFER_ID,
                individualTransfers: [
                    {
                        transferId: 'fake-transfer-id',
                        transferAmount: {
                            currency: 'USD',
                            amount: 20.13
                        },
                        ilpPacket: 'mockBase64encodedIlpPacket',
                        condition: 'mockGeneratedCondition',
                    }
                ]
            };

            const model = new Model({
                ...config,
                cache,
                logger,
                allowTransferWithoutQuote: true,
                rejectTransfersOnExpiredQuotes: false,
            });

            await model.prepareBulkTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkTransfersError).toHaveBeenCalledTimes(0);
            expect(BackendRequests.__postBulkTransfers).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putBulkTransfers).toHaveBeenCalledTimes(1);
        });
    });

    describe('sendNotificationToPayee:', () => {
        const transferId = '1234';
        let cache;

        beforeEach(async () => {
            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();
        });

        afterEach(async () => {
            await cache.disconnect();
        });

        test('sends notification to fsp backend', async () => {
            BackendRequests.__putTransfersNotification = jest.fn().mockReturnValue(Promise.resolve({}));
            const notif = JSON.parse(JSON.stringify(notificationToPayee));

            const expectedRequest = {
                currentState: SDKStateEnum.COMPLETED,
                finalNotification: notif.data,
            };

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.sendNotificationToPayee(notif.data, transferId);
            expect(BackendRequests.__putTransfersNotification).toHaveBeenCalledTimes(1);
            const call = BackendRequests.__putTransfersNotification.mock.calls[0];
            expect(call[0]).toEqual(expectedRequest);
            expect(call[1]).toEqual(transferId);
        });

        test('sends ABORTED notification to fsp backend', async () => {
            BackendRequests.__putTransfersNotification = jest.fn().mockReturnValue(Promise.resolve({}));
            const notif = JSON.parse(JSON.stringify(notificationAbortedToPayee));

            const expectedRequest = {
                currentState: SDKStateEnum.ABORTED,
                finalNotification: notif.data,
            };

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.sendNotificationToPayee(notif.data, transferId);
            expect(BackendRequests.__putTransfersNotification).toHaveBeenCalledTimes(1);
            const call = BackendRequests.__putTransfersNotification.mock.calls[0];
            expect(call[0]).toEqual(expectedRequest);
            expect(call[1]).toEqual(transferId);
        });

        test('sends RESERVED notification to fsp backend', async () => {
            BackendRequests.__putTransfersNotification = jest.fn().mockReturnValue(Promise.resolve({}));
            const notif = JSON.parse(JSON.stringify(notificationReservedToPayee));

            const expectedRequest = {
                currentState: SDKStateEnum.ERROR_OCCURRED,
                finalNotification: notif.data,
                lastError: 'Final notification state not COMMITTED',
            };

            const model = new Model({
                ...config,
                cache,
                logger,
            });

            await model.sendNotificationToPayee(notif.data, transferId);
            expect(BackendRequests.__putTransfersNotification).toHaveBeenCalledTimes(1);
            const call = BackendRequests.__putTransfersNotification.mock.calls[0];
            expect(call[0]).toEqual(expectedRequest);
            expect(call[1]).toEqual(transferId);
        });

    });

    describe('error handling:', () => {
        let cache;
        beforeEach(async () => {
            cache = new Cache({
                cacheUrl: 'redis://dummy:1234',
                logger,
            });
            await cache.connect();
        });
        afterEach(async () => {
            await cache.disconnect();
        });
        test('creates mojaloop spec error body when backend returns standard error code', async () => {
            const model = new Model({
                ...config,
                cache,
                logger,
            });
            const testErr = new HTTPResponseError({
                msg: 'Request returned non-success status code 500',
                res: {
                    data: {
                        statusCode: '3200',
                    },
                }
            });
            const err = await model._handleError(testErr);
            expect(err).toBeDefined();
            expect(err.errorInformation).toBeDefined();
            expect(err.errorInformation.errorCode).toEqual('3200');
            // error message should be the default one, not custom.
            // it is debatibale whether this is truly correct, to overwrite
            // and custom error message; but it is the case for now.
            expect(err.errorInformation.errorDescription).toEqual('Generic ID not found');
        });
        test('creates custom error body when backend returns custom error code', async () => {
            const model = new Model({
                ...config,
                cache,
                logger,
            });
            const customMessage = 'some custom message';
            const testErr = new HTTPResponseError({
                msg: 'Request returned non-success status code 500',
                res: {
                    data: {
                        statusCode: '3299',
                        message: customMessage,
                    },
                }
            });
            const err = await model._handleError(testErr);
            expect(err).toBeDefined();
            expect(err.errorInformation).toBeDefined();
            expect(err.errorInformation.errorCode).toEqual('3299');
            expect(err.errorInformation.errorDescription).toEqual(customMessage);
        });
        test('creates custom error message when backend returns standard error code and message', async () => {
            const model = new Model({
                ...config,
                cache,
                logger,
            });
            const customMessage = 'some custom message';
            const testErr = new HTTPResponseError({
                msg: 'Request returned non-success status code 500',
                res: {
                    data: {
                        statusCode: '3200',
                        message: customMessage,
                    },
                }
            });
            const err = await model._handleError(testErr);
            expect(err).toBeDefined();
            expect(err.errorInformation).toBeDefined();
            expect(err.errorInformation.errorCode).toEqual('3200');
            // error message should be custom
            expect(err.errorInformation.errorDescription).toEqual(customMessage);
        });
    });
});
