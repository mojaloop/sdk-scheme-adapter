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

const defaultConfig = require('./data/defaultConfig');
const { Logger, Transports } = require('@internal/log');
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const mockTxnReqquestsArguments = require('./data/mockTxnRequestsArguments');
const { MojaloopRequests, Ilp } = require('@mojaloop/sdk-standard-components');
const { BackendRequests, HTTPResponseError } = require('@internal/requests');
const Cache = require('@internal/cache');

const getTransfersBackendResponse = require('./data/getTransfersBackendResponse');
const getTransfersMojaloopResponse = require('./data/getTransfersMojaloopResponse');
const getBulkTransfersBackendResponse = require('./data/getBulkTransfersBackendResponse');
const getBulkTransfersMojaloopResponse = require('./data/getBulkTransfersMojaloopResponse');

describe('inboundModel', () => {
    let config;
    let mockArgs;
    let mockTxnReqArgs;
    let logger;

    beforeAll(async () => {
        const logTransports = await Promise.all([Transports.consoleDir()]);
        logger = new Logger({
            context: { app: 'inbound-model-unit-tests' },
            space: 4,
            transports: logTransports,
        });
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

            cache = new Cache({
                host: 'dummycachehost',
                port: 1234,
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

            expect(MojaloopRequests.__putQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].expiration).toBe(mockArgs.internalQuoteResponse.expiration);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][1].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);
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
            expectedQuoteResponseILP = Ilp.__response;
            BackendRequests.__postBulkQuotes = jest.fn().mockReturnValue(Promise.resolve(mockArgs.internalBulkQuoteResponse));

            cache = new Cache({
                host: 'dummycachehost',
                port: 1234,
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
            MojaloopRequests.__putBulkQuotes.mockClear();
            await cache.disconnect();
        });

        test('calls `mojaloopRequests.putBulkQuotes` with the expected arguments.', async () => {
            await model.bulkQuoteRequest(mockArgs.bulkQuoteRequest, mockArgs.fspId);

            expect(MojaloopRequests.__putBulkQuotes).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].expiration).toBe(mockArgs.internalBulkQuoteResponse.expiration);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][1].individualQuoteResults[0].condition).toBe(expectedQuoteResponseILP.condition);
            expect(MojaloopRequests.__putBulkQuotes.mock.calls[0][2]).toBe(mockArgs.fspId);
        });

        test('adds a custom `expiration` property in case it is not defined.', async() => {
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
                host: 'dummycachehost',
                port: 1234,
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
                host: 'dummycachehost',
                port: 1234,
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
            MojaloopRequests.__putTransfers = jest.fn().mockReturnValue(Promise.resolve({}));

            cache = new Cache({
                host: 'dummycachehost',
                port: 1234,
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
            cache.set(`quote_${TRANSFER_ID}`, {
                mojaloopResponse: {
                    expiration: new Date(new Date().getTime() - 1000).toISOString(),
                }
            });
            const args = {
                transferId: TRANSFER_ID,
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
            expect(call[1].transferState).toEqual('COMMITTED');
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
            expect(call[1].transferState).toEqual('COMMITTED');
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
                transferId: TRANSFER_ID,
                amount: {
                    currency: 'USD',
                    amount: 20.13
                },
                ilpPacket: 'mockBase64encodedIlpPacket',
                condition: 'mockGeneratedCondition'
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

        test('pass on transfer without quote.', async () => {
            const TRANSFER_ID = 'without_quote-transfer-id';
            const args = {
                transferId: TRANSFER_ID,
                amount: {
                    currency: 'USD',
                    amount: 20.13
                },
                ilpPacket: 'mockBase64encodedIlpPacket',
                condition: 'mockGeneratedCondition'
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
    });

    describe('prepareBulkTransfer:', () => {
        let cache;

        beforeEach(async () => {
            MojaloopRequests.__putBulkTransfersError.mockClear();
            MojaloopRequests.__putBulkTransfers = jest.fn().mockReturnValue(Promise.resolve({}));
            BackendRequests.__postBulkTransfers = jest.fn().mockReturnValue(Promise.resolve({}));

            cache = new Cache({
                host: 'dummycachehost',
                port: 1234,
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
            expect(call[1].bulkTransferState).toEqual('COMMITTED');
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
            expect(call[1].bulkTransferState).toEqual('COMMITTED');
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
});
