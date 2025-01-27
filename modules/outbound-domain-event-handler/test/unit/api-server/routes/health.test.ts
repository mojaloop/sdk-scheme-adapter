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

 --------------
 ******/
import request from 'supertest';
import axios from 'axios';
import { OutboundDomainEventHandlerAPIServer as ApiServer } from '../../../../src/api-server';
import Config from '../../../../src/shared/config';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { Application } from 'express';
import { IBulkTransactionEntityReadOnlyRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

describe("Test the health route without mock service", () => {
    const apiServer = new ApiServer({
        port: 11999,
        bulkTransactionEntityRepo: {
            canCall: jest.fn()
        } as IBulkTransactionEntityReadOnlyRepo,
    }, logger);
    let app: Application;

    beforeAll(async () => {
        app = await apiServer.startServer();
    });

    afterAll(async () => {
        await apiServer.stopServer();
    });
    test("Health endpoint should work", async () => {
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toEqual('OK');
    });
});

describe("Test the health route with mock service enabled", () => {
    const apiServer = new ApiServer({
        port: 12999,
        bulkTransactionEntityRepo: {
            canCall: jest.fn()
        } as IBulkTransactionEntityReadOnlyRepo,
    }, logger);
    let app: Application;

    beforeAll(async () => {
        app = await apiServer.startServer();
    });

    afterAll(async () => {
        await apiServer.stopServer();
    });

    test("Happy path", async () => {
        Config.set('GET_DATA_FROM_MOCK_SERVICE', true);
        mockedAxios.get.mockResolvedValueOnce({})
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toEqual('OK');
    });
    test.skip("Unhappy path", async () => {
        Config.set('GET_DATA_FROM_MOCK_SERVICE', true);
        mockedAxios.get.mockRejectedValueOnce(new Error('some-error'))
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toEqual('ERROR');
        expect(response.body).toHaveProperty('errors');
        expect(Array.isArray(response.body.errors)).toBe(true);
        expect(response.body.errors.length).toBeGreaterThan(0);
        expect(response.body.errors).toContain('some-error');
    });
});
