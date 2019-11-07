/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Vassilis Barzokas - vassilis.barzokas@modusbox.com                             *
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

let logTransports;

describe('inboundModel', () => {
    let mockArguments;
    let model;
    let cache;

    // the keys are under the secrets folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    defaultEnv.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', defaultEnv.JWS_SIGNING_KEY_PATH);
    defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', defaultEnv.JWS_VERIFICATION_KEYS_DIRECTORY);

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

        mockArguments = {
            quoteRequest: {
                quoteId: 'fake-quote-id',
                transactionId: 'fake-transaction-id',
                amountType: 'SEND',
                amount: {
                    currency: 'XOF',
                    amount: 10
                },
                expiration: '2019-06-04T04:02:10.378Z',
                payer: {
                    partyIdInfo: {
                        partyIdType: 'MSISDN',
                        partyIdentifier: '17855501914',
                        fspId: 'mojaloop-sdk'
                    },
                    personalInfo: {
                        complexName: {
                            firstName: 'Murthy',
                            lastName: 'Kakarlamudi'
                        },
                        dateOfBirth: '2010-10-10'
                    },
                    name: 'Murthy Kakarlamudi',
                    merchantClassificationCode: '123'
                },
                payee: {
                    partyIdInfo: {
                        partyIdType: 'MSISDN',
                        partyIdentifier: '123456789',
                        fspId: 'goldenpayeefsp'
                    },
                    personalInfo: {
                        complexName: {
                            firstName: 'Sridevi',
                            lastName: 'Miriyala'
                        },
                        dateOfBirth: '2010-10-10'
                    },
                    name: 'Sridevi Miriyala',
                    merchantClassificationCode: '456'
                },
                transactionType: {
                    scenario: 'TRANSFER',
                    initiator: 'PAYER',
                    initiatorType: 'CONSUMER'
                }
            },
            internalQuoteResponse: {
                transferAmount: 500,
                transferAmountCurrency: 'XOF',
                payeeReceiveAmount: 490,
                payeeFspFee: 10,
                payeeFspCommission: 0,
                condition: 'fH9pAYDQbmoZLPbvv3CSW2RfjU4jvM4ApG_fqGnR7Xs',
                expiration: new Date(Date.now()),
                isValid: 1
            },
            fspId: 'fake-fsp-id'
        };
    });

    afterEach(() => {
        //we have to destroy the file system watcher or we will leave an async handle open
        destroy();
    });

    describe('quoteRequest', () => {
        let expectedQuoteResponseILP;
        let putQuotesSpy;

        beforeEach(() => {
            //model.ilp is already mocked globally, so let's just get its mock response back.
            expectedQuoteResponseILP = model.ilp.getQuoteResponseIlp();

            model.backendRequests.postQuoteRequests = jest.fn().mockReturnValue(Promise.resolve(mockArguments.internalQuoteResponse));

            putQuotesSpy = jest.spyOn(model.mojaloopRequests, 'putQuotes');
        });

        afterEach(() => {
            model.backendRequests.postQuoteRequests.mockClear();
            putQuotesSpy.mockClear();
        });

        test('calls `mojaloopRequests.putQuotes` with the expected arguments.', async () => {
            await model.quoteRequest(mockArguments.quoteRequest, mockArguments.fspId);

            expect(putQuotesSpy).toHaveBeenCalledTimes(1);
            expect(putQuotesSpy.mock.calls[0][1].expiration).toBe(mockArguments.internalQuoteResponse.expiration);
            expect(putQuotesSpy.mock.calls[0][1].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(putQuotesSpy.mock.calls[0][1].condition).toBe(expectedQuoteResponseILP.condition);
            expect(putQuotesSpy.mock.calls[0][2]).toBe(mockArguments.fspId);
        });

        test('adds a custom `expiration` property in case it is not defined.', async() => {
            // set a custom mock time in the global Date object in order to avoid race conditions.
            // Make sure to clear it at the end of the test case.
            const currentTime = new Date().getTime();
            const dateSpy = jest.spyOn(Date.prototype, 'getTime').mockImplementation(() => currentTime);
            const expectedExpirationDate = new Date(currentTime + (model.expirySeconds * 1000)).toISOString();

            delete mockArguments.internalQuoteResponse.expiration;

            await model.quoteRequest(mockArguments.quoteRequest, mockArguments.fspId);

            expect(putQuotesSpy).toHaveBeenCalledTimes(1);
            expect(putQuotesSpy.mock.calls[0][1].expiration).toBe(expectedExpirationDate);
            expect(putQuotesSpy.mock.calls[0][1].ilpPacket).toBe(expectedQuoteResponseILP.ilpPacket);
            expect(putQuotesSpy.mock.calls[0][1].condition).toBe(expectedQuoteResponseILP.condition);
            expect(putQuotesSpy.mock.calls[0][2]).toBe(mockArguments.fspId);

            dateSpy.mockClear();
        });


    });

    describe('transferPrepare:', () => {
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

            const mockFn = jest.fn();
            model.mojaloopRequests.putTransfersError = mockFn;

            await model.prepareTransfer(args, mockArguments.fspId);

            expect(mockFn).toHaveBeenCalledTimes(1);
            const call = mockFn.mock.calls[0];
            expect(call[0]).toEqual(TRANSFER_ID);
            expect(call[1].errorInformation.errorCode).toEqual('3302');
        });
    });
});
