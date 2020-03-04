/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

'use strict';

jest.unmock('@mojaloop/sdk-standard-components');
jest.mock('request-promise-native');
jest.mock('redis');

const path = require('path');
const fs = require('fs');
const uuidv4 = require('uuidv4');
const yaml = require('js-yaml');
const Validate = require('@internal/validate');
const { Logger } = require('@internal/log');
const supertest = require('supertest');
const request = require('request-promise-native');
const OpenAPIResponseValidator = require('openapi-response-validator').default;

const defaultConfig = require('./data/defaultConfig');

// Accounts
const postAccountsBody = require('./data/postAccountsBody');
const postAccountsSuccessResponse = require('./data/postAccountsSuccessResponse');
const postAccountsSuccessResponseWithError1 = require('./data/postAccountsSuccessResponseWithError1');
const postAccountsSuccessResponseWithError2 = require('./data/postAccountsSuccessResponseWithError2');
const postAccountsErrorTimeoutResponse = require('./data/postAccountsErrorTimeoutResponse');
const postAccountsErrorMojaloopResponse = require('./data/postAccountsErrorMojaloopResponse');

// Transfers
const postQuotesBody = require('./data/postQuotesBody');
const postTransfersBody = require('./data/postTransfersBody');
const putPartiesBody = require('./data/putPartiesBody');
const putQuotesBody = require('./data/putQuotesBody');
const putTransfersBody = require('./data/putTransfersBody');
const postTransfersBadBody = require('./data/postTransfersBadBody');
const postTransfersSimpleBody = require('./data/postTransfersSimpleBody');
const postTransfersSuccessResponse = require('./data/postTransfersSuccessResponse');
const postTransfersErrorTimeoutResponse = require('./data/postTransfersErrorTimeoutResponse');
const postTransfersErrorMojaloopResponse = require('./data/postTransfersErrorMojaloopResponse');

const InboundServer = require('../../InboundServer');
const OutboundServer = require('../../OutboundServer');

describe('Outbound API', () => {
    const logTransports = [() => {}];
    let reqOutbound;
    let reqInbound;
    let serverInbound;
    let serverOutbound;
    let apiSpecs;
    let requestValidator;
    let logger;
    let requestSpy;

    beforeAll(async () => {
        const specPath = path.join(__dirname, '../../OutboundServer/api.yaml');
        apiSpecs = yaml.load(fs.readFileSync(specPath));
        requestValidator = new Validate();
        await requestValidator.initialise(apiSpecs);

        logger = new Logger({ context: { app: 'outbound-model-unit-tests' }, space: 4, transports: logTransports });
    });

    beforeEach(async () => {
        const defConfig = JSON.parse(JSON.stringify(defaultConfig));
        defConfig.requestProcessingTimeoutSeconds = 2;
        serverOutbound = new OutboundServer(defConfig);
        reqOutbound = supertest(await serverOutbound.setupApi());
        await serverOutbound.start();

        serverInbound = new InboundServer(defConfig);
        reqInbound = supertest(await serverInbound.setupApi());
        await serverInbound.start();
    });

    afterEach(async () => {
        await serverOutbound.stop();
        await serverInbound.stop();
        if (requestSpy) {
            requestSpy.mockRestore();
        }
    });

    describe('POST /accounts', () => {
        beforeEach(() => {
            uuidv4.__reset();
        });

        /**
         *
         * @param putBodyFn {function}
         * @param responseCode {number}
         * @param responseBody {object}
         *
         * @return {Promise<any>}
         */
        const testPostAccounts = async (putBodyFn, responseCode, responseBody) => {
            let pendingRequest = Promise.resolve();
            const handleRequest = async (req) => {
                const urlPath = new URL(req.uri).pathname;
                const body = JSON.parse(req.body);
                const method = req.method;
                expect(method).toBe('POST');
                expect(urlPath).toBe('/participants');
                const putBody = await Promise.resolve(putBodyFn(body));
                let putUrl = `/participants/${body.requestId}`;
                if (putBody.errorInformation) {
                    putUrl += '/error';
                }
                await reqInbound
                    .put(putUrl)
                    .send(putBody)
                    .set('Date', new Date().toISOString())
                    .set('fspiop-source', 'mojaloop-sdk')
                    .expect(200);
            };
            requestSpy = request.mockImplementation((req) => {
                pendingRequest = handleRequest(req);
                return Promise.resolve({headers: {}, statusCode: 202});
            });
            await reqOutbound
                .post('/accounts')
                .send(postAccountsBody)
                .then((res) => {
                    const {body} = res;
                    expect(body).toEqual(responseBody);
                    const responseValidator = new OpenAPIResponseValidator(apiSpecs.paths['/accounts'].post);
                    const err = responseValidator.validateResponse(responseCode, body);
                    if (err) {
                        console.log(body);
                        throw err;
                    }
                });
            await pendingRequest;
        };

        test('should return success response', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: body.currency,
            });
            return testPostAccounts(putBodyFn, 200, postAccountsSuccessResponse);
        });

        test('should return success response with error info on invalid currency (1)', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: undefined,
            });
            return testPostAccounts(putBodyFn, 200, postAccountsSuccessResponseWithError1);
        });

        test('should return success response with error info on errorInformation presence (2)', () => {
            const putBodyFn = (body) => ({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                    errorInformation: {
                        errorCode: '3204',
                        errorDescription: 'Party not found',
                    },
                })),
                currency: 'USD',
            });
            return testPostAccounts(putBodyFn, 200, postAccountsSuccessResponseWithError2);
        });

        test('should return timeout error response', () => {
            const putBodyFn = (body) => new Promise(resolve => setTimeout(() => resolve({
                partyList: body.partyList.map(party => ({
                    partyId: party,
                })),
                currency: body.currency,
            }), 3000));
            return testPostAccounts(putBodyFn, 504, postAccountsErrorTimeoutResponse);
        });

        test('should return mojaloop error response', () => {
            const putBodyFn = () => ({
                errorInformation: {
                    errorCode: '3204',
                    errorDescription: 'Party not found',
                },
            });
            return testPostAccounts(putBodyFn, 500, postAccountsErrorMojaloopResponse);
        });
    });

    describe('POST /transfers', () => {
        let inboundRequestValidator;

        beforeAll(async () => {
            const specPath = path.join(__dirname, '../../InboundServer/api.yaml');
            const apiSpecs = yaml.load(fs.readFileSync(specPath));
            inboundRequestValidator = new Validate();
            await inboundRequestValidator.initialise(apiSpecs);
        });

        beforeEach(() => {
            uuidv4.__reset();
        });

        /**
         *
         * @param bodyFn {Object}
         * @param responseCode {number}
         * @param bodyFn.parties {object}
         * @param bodyFn.parties.put {function}
         * @param bodyFn.quotes {object}
         * @param bodyFn.quotes.put {function}
         * @param bodyFn.quotes.post {function}
         * @param bodyFn.transfers {object}
         * @param bodyFn.transfers.put {function}
         * @param bodyFn.transfers.post {function}
         * @param responseBody {object}

         * @return {Promise<any>}
         */
        const testPostTransfers = async (bodyFn, responseCode, responseBody) => {
            let pendingRequest = Promise.resolve();
            let currentRequest = Promise.resolve();
            const handleRequest = async (req) => {
                const urlPath = new URL(req.uri).pathname;
                const body = req.body && JSON.parse(req.body);
                const headers = req.headers;
                const method = req.method;
                let putBody;
                let putUrl;
                inboundRequestValidator.validateRequest({ method, path: urlPath, request: { headers, body } }, logger);
                if (urlPath.startsWith('/parties/')) {
                    expect(method).toBe('GET');
                    putBody = await Promise.resolve(bodyFn.parties.put());
                    putUrl = urlPath;
                } else if (urlPath === '/quotes') {
                    expect(method).toBe('POST');
                    expect(body).toEqual(bodyFn.quotes.post(body));
                    putBody = await Promise.resolve(bodyFn.quotes.put(body));
                    putUrl = `/quotes/${body.quoteId}`;
                } else if (urlPath === '/transfers') {
                    expect(method).toBe('POST');
                    expect(body).toEqual(bodyFn.transfers.post(body));
                    putBody = await Promise.resolve(bodyFn.transfers.put(body));
                    putUrl = `/transfers/${body.transferId}`;
                } else {
                    throw new Error(`Unexpected url ${urlPath}`);
                }
                if (putBody.errorInformation) {
                    putUrl += '/error';
                }
                // supertest have issues handling simultaneous requests,
                //  so just wait for the previous request to finish
                await currentRequest;
                currentRequest = reqInbound
                    .put(putUrl)
                    .send(putBody)
                    .set('Date', new Date().toISOString())
                    .set('fspiop-source', 'mojaloop-sdk')
                    .expect(200);
                await currentRequest;
            };
            requestSpy = request.mockImplementation((req) => {
                pendingRequest = handleRequest(req);
                return Promise.resolve({headers: {}, statusCode: 202});
            });

            await reqOutbound
                .post('/transfers')
                .send(postTransfersSimpleBody)
                .then((res) => {
                    const {body} = res;
                    expect(body).toEqual(responseBody);
                    const responseValidator = new OpenAPIResponseValidator(apiSpecs.paths['/transfers'].post);
                    const err = responseValidator.validateResponse(responseCode, body);
                    if (err) {
                        console.log(body);
                        throw err;
                    }
                });

            await pendingRequest;
        };

        test('fails validation on invalid request and gives detailed error message indicating source of failure', (done) => {
            reqOutbound
                .post('/transfers')
                .send(postTransfersBadBody)
                .expect(400, {
                    message: '.body.to.idType should be equal to one of the allowed values',
                    statusCode: 400,
                })
                .end(done);
        });

        test('should return success response', () => {
            const bodyFn = {
                parties: {
                    put: () => putPartiesBody,
                },
                quotes: {
                    post: (body) => ({
                        ...postQuotesBody,
                        expiration: body.expiration,
                    }),
                    put: () => putQuotesBody,
                },
                transfers: {
                    post: (body) => ({
                        ...postTransfersBody,
                        expiration: body.expiration,
                    }),
                    put: () => putTransfersBody,
                },
            };
            return testPostTransfers(bodyFn, 200, postTransfersSuccessResponse);
        });

        test('should return timeout error response on party resolution', () => {
            const putBodyFn = {
                parties: {
                    put: () => new Promise(
                        resolve => setTimeout(() => resolve(putPartiesBody),
                            3000)),
                },
                quotes: {
                    put: () => putQuotesBody,
                },
                transfers: {
                    put: () => putTransfersBody,
                }
            };
            return testPostTransfers(putBodyFn, 504, postTransfersErrorTimeoutResponse);
        });

        test('should return mojaloop error response on party resolution', () => {
            const putBodyFn = {
                parties: {
                    put: () => ({
                        errorInformation: {
                            errorCode: '3204',
                            errorDescription: 'Party not found',
                        },
                    }),
                },
                quotes: {
                    put: () => putQuotesBody
                },
                transfers: {
                    put: () => putTransfersBody
                },
            };
            return testPostTransfers(putBodyFn, 500, postTransfersErrorMojaloopResponse);
        });
    });
});
