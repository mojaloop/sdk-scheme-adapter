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
jest.mock('@internal/requests').BackendRequests;

const { init, destroy, setConfig, getConfig } = require('../../../../config.js');
const path = require('path');
const MockCache = require('../../../__mocks__/@internal/cache.js');
const { Logger, Transports } = require('@internal/log');
const Model = require('@internal/model').InboundTransfersModel;
const defaultEnv = require('./data/defaultEnv');
const mockArguments = require('./data/mockArguments');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');

let logTransports;

describe('inboundModel', () => {
    let mockArgs;
    let model;
    let cache;

    // the keys are under the secrets folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    defaultEnv.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', defaultEnv.JWS_SIGNING_KEY_PATH);
    defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY);
    defaultEnv.ILP_SECRET = 'mockILPSecret';

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
    });

    beforeEach(async () => {
        init();

        await setConfig(defaultEnv);
        const conf = getConfig();

        cache = new MockCache();
        model = new Model({
            cache,
            logger: new Logger({
                context: { app: 'inbound-model-unit-tests' },
                space: 4,
                transports: logTransports
            }),
            ...conf
        });

        mockArgs = JSON.parse(JSON.stringify(mockArguments));
        mockArgs.internalQuoteResponse.expiration = new Date(Date.now());
    });

    afterEach(() => {
        //we have to destroy the file system watcher or we will leave an async handle open
        destroy();
    });

    describe('quoteRequest', () => {
        let expectedQuoteResponseILP;

        beforeEach(() => {
            //model.ilp is already mocked globally, so let's just get its mock response back.
            expectedQuoteResponseILP = model.ilp.getQuoteResponseIlp();

            model.backendRequests.postQuoteRequests = jest.fn().mockReturnValue(Promise.resolve(mockArgs.internalQuoteResponse));
        });

        afterEach(() => {
            model.backendRequests.postQuoteRequests.mockClear();
            MojaloopRequests.__putQuotes.mockClear();
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
            const expectedExpirationDate = new Date(currentTime + (model.expirySeconds * 1000)).toISOString();

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
        beforeEach(() => {
            model.backendRequests.postTransfers = jest.fn().mockReturnValue(Promise.resolve({}));
            model._mojaloopRequests.putTransfers = jest.fn().mockReturnValue(Promise.resolve({}));
        });

        afterEach(() => {
            MojaloopRequests.__putTransfersError.mockClear();
            model.backendRequests.postTransfers.mockClear();
            model._mojaloopRequests.putTransfers.mockClear();
        });

        test('fail on quote `expiration` deadline.', async () => {
            model.rejectTransfersOnExpiredQuotes = true;
            const TRANSFER_ID = 'fake-transfer-id';
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
            model.allowTransferWithoutQuote = false;
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

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(1);
            const call = MojaloopRequests.__putTransfersError.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('2001');
        });
        test('pass on transfer without quote.', async () => {
            model.allowTransferWithoutQuote = true;
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

            await model.prepareTransfer(args, mockArgs.fspId);

            expect(MojaloopRequests.__putTransfersError).toHaveBeenCalledTimes(0);
            expect(model.backendRequests.postTransfers).toHaveBeenCalledTimes(1);
            expect(model._mojaloopRequests.putTransfers).toHaveBeenCalledTimes(1);
        });
    });
});
