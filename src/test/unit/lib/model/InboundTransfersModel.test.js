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
const { MojaloopRequests, Ilp } = require('@mojaloop/sdk-standard-components');
const { BackendRequests } = require('@internal/requests');
const Cache = require('@internal/cache');

describe('inboundModel', () => {
    let config;
    let mockArgs;
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

    describe('transferPrepare:', () => {
        let cache;

        beforeEach(async () => {
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
            MojaloopRequests.__putTransfersError.mockClear();
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
});
