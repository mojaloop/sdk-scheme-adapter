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
        port: 49999,
        bulkTransactionEntityRepo: {
            canCall: jest.fn()
        } as IBulkTransactionEntityReadOnlyRepo,
    }, logger);
    let app: Application;

    beforeEach(async () => {
        app = await apiServer.startServer();
    });

    afterEach(async () => {
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
        port: 59999,
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
