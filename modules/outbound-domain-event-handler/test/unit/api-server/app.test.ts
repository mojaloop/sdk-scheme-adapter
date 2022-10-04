import request from 'supertest';
import { OutboundDomainEventHandlerAPIServer as ApiServer } from '../../../src/api-server';
import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { Application } from 'express';
import { IBulkTransactionEntityReadOnlyRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

describe("Test the docs endpoints", () => {
    const apiServer = new ApiServer({
        port: 39999,
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
    test("/docs should be redirected to /docs/", async () => {
        const response = await request(app).get("/docs");
        expect(response.statusCode).toBe(301);
        expect(response.headers).toHaveProperty('location');
        expect(response.headers.location).toEqual('/docs/');
    });
    test("/docs/ endpoint should work", async () => {
        const response = await request(app).get("/docs/");
        expect(response.statusCode).toBe(200);
        expect(response).toHaveProperty('text');
    });

    test("/someunknown endpoint should throw 404 error", async () => {
        const response = await request(app).get("/someunknown");
        expect(response.statusCode).toBe(404);
    });
});
