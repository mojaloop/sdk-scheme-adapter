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
jest.mock('@internal/requests').BackendRequests;

jest.mock('@mojaloop/sdk-standard-components', () => ({
    __esModule: true,
    ...jest.requireActual('@mojaloop/sdk-standard-components'),
    ...require('../../../mocks/@mojaloop/sdk-standard-components')
}));

const { init, destroy, setConfig, getConfig } = require('../../../../config.js');
const path = require('path');
const MockCache = require('../../../__mocks__/cache.js');
const { Logger, Transports } = require('@internal/log');
const Model = require('@internal/model').inboundTransfersModel;

let logTransports;

// dummy environment config
const config = {
    INBOUND_LISTEN_PORT: '4000',
    OUTBOUND_LISTEN_PORT: '4001',
    MUTUAL_TLS_ENABLED: 'false',
    VALIDATE_INBOUND_JWS: 'true',
    JWS_SIGN: 'true',
    JWS_SIGNING_KEY_PATH: '/jwsSigningKey.key',
    JWS_VERIFICATION_KEYS_DIRECTORY: '/jwsVerificationKeys',
    IN_CA_CERT_PATH: './secrets/cacert.pem',
    IN_SERVER_CERT_PATH: './secrets/servercert.pem',
    IN_SERVER_KEY_PATH: './secrets/serverkey.pem',
    OUT_CA_CERT_PATH: './secrets/cacert.pem',
    OUT_CLIENT_CERT_PATH: './secrets/servercert.pem',
    OUT_CLIENT_KEY_PATH: './secrets/serverkey.pem',
    LOG_INDENT: '0',
    CACHE_HOST: '172.17.0.2',
    CACHE_PORT: '6379',
    PEER_ENDPOINT: '172.17.0.3:4000',
    BACKEND_ENDPOINT: '172.17.0.5:4000',
    DFSP_ID: 'mojaloop-sdk',
    ILP_SECRET: 'Quaixohyaesahju3thivuiChai5cahng',
    EXPIRY_SECONDS: '60',
    AUTO_ACCEPT_QUOTES: 'false',
    AUTO_ACCEPT_PARTY: 'false',
    CHECK_ILP: 'true',
    ENABLE_TEST_FEATURES: 'false',
    ENABLE_OAUTH_TOKEN_ENDPOINT: 'false',
    WS02_BEARER_TOKEN: '7718fa9b-be13-3fe7-87f0-a12cf1628168',
    OAUTH_TOKEN_ENDPOINT: '',
    OAUTH_CLIENT_KEY: '',
    OAUTH_CLIENT_SECRET: '',
    OAUTH_REFRESH_SECONDS: '3600',
    REJECT_EXPIRED_QUOTE_RESPONSES: 'false',
    REJECT_TRANSFERS_ON_EXPIRED_QUOTES: 'false',
    REJECT_EXPIRED_TRANSFER_FULFILS: 'false',
};
describe('inboundModel:', () => {
    let mockArguments;
    let model;
    let cache;

    // the keys are under the secrets folder that is supposed to be moved by Dockerfile
    // so for the needs of the unit tests, we have to define the proper path manually.
    config.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', config.JWS_SIGNING_KEY_PATH);
    config.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', config.JWS_VERIFICATION_KEYS_DIRECTORY);

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
    });

    beforeEach(async () => {
        init();

        await setConfig(config);
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

    describe('quoteRequest:', () => {
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
