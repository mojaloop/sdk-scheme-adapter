/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

const supertest = require('supertest');

const { ISO_20022_HEADER_PART} = require('../../src/constants');
const defaultConfig = require('./data/defaultConfig');
const putPartiesBody = require('./data/putPartiesBody');
const postQuotesBody = require('./data/postQuotesBody');
const putParticipantsBody = require('./data/putParticipantsBody');
const commonHttpHeaders = require('./data/commonHttpHeaders');
const isoBodies = require('./inboundApi/data/isoBodies.json');

jest.mock('@mojaloop/sdk-standard-components');
jest.mock('~/lib/cache');
jest.mock('~/lib/model/lib/requests', () => require('./lib/model/mockedLibRequests'));

const { Jws } = require('@mojaloop/sdk-standard-components');
const { logger } = require('~/lib/logger');
const InboundServer = require('~/InboundServer');
const Cache = require('~/lib/cache');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

describe('Inbound Server', () => {
    describe('PUT /parties', () => {
        let serverConfig;

        beforeEach(() => {
            Jws.validator.__validate.mockClear();
            serverConfig = JSON.parse(JSON.stringify(defaultConfig));
        });

        async function testPartiesJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            serverConfig.validateInboundJws = validateInboundJws;
            serverConfig.validateInboundPutPartiesJws = validateInboundPutPartiesJws;
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            await supertest(svr._server)
                .put('/parties/MSISDN/123456789')
                .send(putPartiesBody)
                .set('content-type', 'application/vnd.interoperability.parties+json;version=1.1')
                .set('fspiop-http-method', 'PUT')
                .set('fspiop-uri', '/parties/MSISDN/123456789')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(Jws.validator.__validate).toHaveBeenCalledTimes(expectedValidationCalls);
        }

        async function testPartiesHeaderValidation(contentType, expectedStatusCode, expectedBody = null) {
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const body = contentType.includes(ISO_20022_HEADER_PART)
                ? isoBodies.putPartiesRequest
                : putPartiesBody;
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            const result = await supertest(svr._server)
                .put('/parties/MSISDN/123456789')
                .send(body)
                .set(commonHttpHeaders)
                .set('content-type', contentType)
                .set('fspiop-http-method', 'PUT')
                .set('fspiop-uri', '/parties/MSISDN/123456789')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(result.status).toEqual(expectedStatusCode);

            if (expectedBody) {
                expect(result.body).toEqual(expectedBody);
            }
        }

        test('validates incoming JWS when VALIDATE_INBOUND_JWS and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testPartiesJwsValidation(true, true, 1));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testPartiesJwsValidation(true, false, 0));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testPartiesJwsValidation(false, false, 0));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testPartiesJwsValidation(false, true, 0));

        test('processes parties request with valid content-type headers successfully', async () => {
            await testPartiesHeaderValidation('application/vnd.interoperability.parties+json;version=1.1', 200);
        });

        test('returns error on invalid parties content-type headers', async () => {
            await testPartiesHeaderValidation(
                'application/json',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testPartiesHeaderValidation(
                'application/vnd.interoperability.test+json;version=1.1',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testPartiesHeaderValidation(
                'application/vnd.interoperability.parties+json;version=6.0',
                406,
                {
                    'errorInformation': {
                        'errorCode': '3001',
                        'errorDescription': 'Unacceptable version requested',
                        'extensionList': expect.any(Array)
                    }
                }
            );
        });
    });

    describe('POST /quotes', () => {
        let serverConfig;
        beforeEach(() => {
            Jws.validator.__validate.mockClear();
            serverConfig = JSON.parse(JSON.stringify(defaultConfig));
        });
        async function testQuotesJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            serverConfig.validateInboundJws = validateInboundJws;
            serverConfig.validateInboundPutPartiesJws = validateInboundPutPartiesJws;
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            await supertest(svr._server)
                .post('/quotes')
                .send(postQuotesBody)
                .set(commonHttpHeaders)
                .set('content-type', 'application/vnd.interoperability.quotes+json;version=1.1')
                .set('fspiop-http-method', 'POST')
                .set('fspiop-uri', '/quotes')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(Jws.validator.__validate).toHaveBeenCalledTimes(expectedValidationCalls);
        }

        async function testQuotesHeaderValidation(contentType, expectedStatusCode, expectedBody = null) {
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            const result = await supertest(svr._server)
                .post('/quotes')
                .send(postQuotesBody)
                .set(commonHttpHeaders)
                .set('content-type', contentType)
                .set('fspiop-http-method', 'POST')
                .set('fspiop-uri', '/quotes')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(result.status).toEqual(expectedStatusCode);
            if (expectedBody) {
                expect(result.body).toEqual(expectedBody);
            }
        }

        test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is false', () =>
            testQuotesJwsValidation(true, false, 1));

        test('validates incoming JWS on other routes when VALIDATE_INBOUND_JWS is true and VALIDATE_INBOUND_PUT_PARTIES_JWS is true', () =>
            testQuotesJwsValidation(true, true, 1));

        test('processes quotes request with valid content-type headers successfully', async () => {
            await testQuotesHeaderValidation('application/vnd.interoperability.quotes+json;version=1.1', 202);
        });

        test('returns error on invalid quotes content-type headers', async () => {
            await testQuotesHeaderValidation(
                'application/json',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testQuotesHeaderValidation(
                'application/vnd.interoperability.parties+json;version=1.1',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testQuotesHeaderValidation(
                'application/vnd.interoperability.quotes+json;version=6.0',
                406,
                {
                    'errorInformation': {
                        'errorCode': '3001',
                        'errorDescription': 'Unacceptable version requested',
                        'extensionList': expect.any(Array)
                    }
                }
            );
        });
    });

    describe('PUT /participants', () => {
        let serverConfig;
        beforeEach(() => {
            Jws.validator.__validate.mockClear();
            serverConfig = JSON.parse(JSON.stringify(defaultConfig));
        });

        async function testParticipantsJwsValidation(validateInboundJws, validateInboundPutPartiesJws, expectedValidationCalls) {
            serverConfig.validateInboundJws = validateInboundJws;
            serverConfig.validateInboundPutPartiesJws = validateInboundPutPartiesJws;
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            await supertest(svr._server)
                .put('/participants/00000000-0000-1000-a000-000000000002')
                .send(putParticipantsBody)
                .set(commonHttpHeaders)
                .set('content-type', 'application/vnd.interoperability.participants+json;version=1.1')
                .set('fspiop-http-method', 'PUT')
                .set('fspiop-uri', '/participants/00000000-0000-1000-a000-000000000002')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(Jws.validator.__validate).toHaveBeenCalledTimes(expectedValidationCalls);
        }

        async function testParticipantsHeaderValidation(contentType, expectedStatusCode, expectedBody = null) {
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            const svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
            const result = await supertest(svr._server)
                .put('/participants/00000000-0000-1000-a000-000000000002')
                .send(putParticipantsBody)
                .set(commonHttpHeaders)
                .set('content-type', contentType)
                .set('fspiop-http-method', 'PUT')
                .set('fspiop-uri', '/participants/00000000-0000-1000-a000-000000000002')
                .set('date', new Date().toISOString());
            await svr.stop();
            expect(result.status).toEqual(expectedStatusCode);
            if (expectedBody) {
                expect(result.body).toEqual(expectedBody);
            }
        }

        test('validates incoming JWS when VALIDATE_INBOUND_JWS is true', () =>
            testParticipantsJwsValidation(true, true, 1));

        test('does not validate incoming JWS when VALIDATE_INBOUND_JWS is false ', () =>
            testParticipantsJwsValidation(false, false, 0));

        test('processes participants request with valid content-type headers successfully', async () => {
            await testParticipantsHeaderValidation('application/vnd.interoperability.participants+json;version=1.1', 200);
        });

        test('returns error on invalid participants content-type headers', async () => {
            await testParticipantsHeaderValidation(
                'application/json',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testParticipantsHeaderValidation(
                'application/vnd.interoperability.parties+json;version=1.1',
                400,
                {
                    'errorInformation': {
                        'errorCode': '3101',
                        'errorDescription': 'Malformed syntax'
                    }
                }
            );
            await testParticipantsHeaderValidation(
                'application/vnd.interoperability.participants+json;version=6.0',
                406,
                {
                    'errorInformation': {
                        'errorCode': '3001',
                        'errorDescription': 'Unacceptable version requested',
                        'extensionList': expect.any(Array)
                    }
                }
            );
        });
    });

    describe('mTLS test', () => {
        let defConfig;
        let httpServerSpy;
        let httpsServerSpy;

        beforeAll(() => {
            httpServerSpy = jest.spyOn(http, 'createServer');
            httpsServerSpy = jest.spyOn(https, 'createServer');
        });

        beforeEach(() => {
            defConfig = JSON.parse(JSON.stringify(defaultConfig));
            httpServerSpy.mockClear();
            httpsServerSpy.mockClear();
        });

        afterAll(() => {
            httpServerSpy.mockRestore();
            httpsServerSpy.mockRestore();
        });

        async function testTlsServer(enableTls) {
            defConfig.inbound.tls.mutualTLS.enabled = enableTls;
            const cache = new Cache({
                cacheUrl: defConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: defConfig.unsubscribeTimeoutMs,
            });
            const server = new InboundServer(defConfig, logger, cache);
            await server.start();
            if (enableTls) {
                expect(httpsServerSpy).toHaveBeenCalled();
                expect(httpServerSpy).not.toHaveBeenCalled();
            } else {
                expect(httpsServerSpy).not.toHaveBeenCalled();
                expect(httpServerSpy).toHaveBeenCalled();
            }
            await server.stop();
        }

        test('Inbound server should use HTTPS if inbound mTLS enabled', () =>
            testTlsServer(true));

        test('Inbound server should use HTTP if inbound mTLS disabled', () =>
            testTlsServer(false));
    });

    describe('JWS verification keys', () => {
        let svr;
        let keysDir;

        beforeEach(async () => {
            const serverConfig = JSON.parse(JSON.stringify(defaultConfig));
            serverConfig.validateInboundJws = true;
            keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
            const mockFilePath = path.join(keysDir, 'mojaloop-sdk.pem');
            fs.writeFileSync(mockFilePath, 'foo-key');
            serverConfig.jwsVerificationKeysDirectory = keysDir;
            const cache = new Cache({
                cacheUrl: serverConfig.cacheUrl,
                logger: logger.push({ component: 'cache' }),
                unsubscribeTimeoutMs: serverConfig.unsubscribeTimeoutMs,
            });
            svr = new InboundServer(serverConfig, logger, cache);
            await svr.start();
        });

        afterEach(async () => {
            await svr.stop();
            fs.rmSync(keysDir, { recursive: true });
        });

        it('updates server configuration when a new JWS verification key '
            + 'is added to the target monitored folder.', async () => {
            let keys;

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk']);

            const mockFilePath = path.join(keysDir, 'mock-jws.pem');
            fs.writeFileSync(mockFilePath, 'foo-key');

            await new Promise(resolve => setTimeout(() => resolve(), 1000));

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk', 'mock-jws']);
        });

        it('updates server configuration when a new JWS verification key '
            + 'is removed from the target monitored folder.', async () => {
            let keys;

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk']);

            const mockFilePath = path.join(keysDir, 'mock-jws.pem');
            fs.writeFileSync(mockFilePath, 'foo-key');

            await new Promise(resolve => setTimeout(() => resolve(), 1000));

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk', 'mock-jws']);

            fs.unlinkSync(mockFilePath);

            await new Promise(resolve => setTimeout(() => resolve(), 1000));

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk']);
        });

        it('updates server configuration when a new JWS verification key '
            + 'is changed in the target monitored folder.', async () => {
            let keys;

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk']);

            const mockFilePath = path.join(keysDir, 'mock-jws.pem');
            fs.writeFileSync(mockFilePath, 'foo-key');

            await new Promise(resolve => setTimeout(() => resolve(), 1000));

            keys = Object.keys(Jws.validator.__validationKeys);
            expect(keys).toEqual(['mojaloop-sdk', 'mock-jws']);

            fs.writeFileSync(mockFilePath, 'foo-key-updated');

            await new Promise(resolve => setTimeout(() => resolve(), 1000));

            expect(Jws.validator.__validationKeys['mock-jws'].toString()).toEqual('foo-key-updated');
        });
    });
});
