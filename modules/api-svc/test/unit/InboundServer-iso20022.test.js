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
 - Name Surname <name.surname@mojaloop.io>

 * Eugen Klymniuk <eugen.klymniuk@infitx.com>
 --------------
 **********/

Object.assign(process.env, {
    API_TYPE: 'iso20022',
    ILP_VERSION: '4',
    PEER_ENDPOINT: 'localhost:4000',
    BACKEND_ENDPOINT: 'localhost:4000',
});

jest.mock('../../src/lib/cache');
jest.mock('../../src/lib/model/lib/requests', () => require('./lib/model/mockedLibRequests'));

const supertest = require('supertest');
const InboundServer = require('../../src/InboundServer');
const Cache = require('../../src/lib/cache');
const config = require('../../src/config');
const helpers = require('../helpers');
const { logger } = require('../../src/lib/logger');

const isoBodies = require('./inboundApi/data/isoBodies');
const commonHttpHeaders = require('./data/commonHttpHeaders');
const transactionRequestResponse = require('./lib/model/data/transactionRequestResponse');

const createIsoHeaders = resource => ({
    ...commonHttpHeaders,
    'content-type': helpers.createIsoHeader(resource)
});

describe('Inbound Server ISO-20022 Tests -->', () => {
    let server;

    beforeEach(async () => {
        server = new InboundServer(config, logger, new Cache(config));
        await server?.start();
    });

    afterEach(async () => {
        await server?.stop();
    });

    const sendRequest = async ({ method, path, body, headers }) =>
        supertest(server._server)[method](path)
            .send(body)
            .set(headers)
            .set('fspiop-http-method', method.toUpperCase())
            .set('fspiop-uri', path)
            .set('date', new Date().toISOString());

    test('should have ISO config', () => {
        expect(config.isIsoApi).toBe(true);
    });

    describe('Incoming request validation Tests', () => {
        test('should pass validation for ISO PUT /parties request', async () => {
            const resource = 'parties';
            const result = await sendRequest({
                method: 'put',
                path: `/${resource}/MSISDN/123456789`,
                body: isoBodies.putPartiesRequest,
                headers: createIsoHeaders(resource)
            });
            expect(result.status).toBe(200);
        });

        describe('/transactionRequests request', () => {
            const resource = 'transactionRequests';
            const createPutRequestDetails = (headers) => ({
                method: 'put',
                path: `/${resource}/01JBXZKAMA6VHAHT47MJRN352Q`,
                body: transactionRequestResponse.data,
                headers,
            });

            test('should pass validation for PUT /transactionRequests request with FSPIOP header', async () => {
                const fspiopHeaders = {
                    ...commonHttpHeaders,
                    'content-type': helpers.createFspiopHeader(resource, '2.0'),
                };
                const mockReq = createPutRequestDetails(fspiopHeaders);

                const result = await sendRequest(mockReq);
                expect(result.status).toBe(200);
            });

            test('should fail validation for PUT /transactionRequests request with ISO header', async () => {
                const isoHeaders = createIsoHeaders(resource);
                const mockReq = createPutRequestDetails(isoHeaders);

                const result = await sendRequest(mockReq);
                expect(result.status).toBe(400);
            });
        });
    });
});
