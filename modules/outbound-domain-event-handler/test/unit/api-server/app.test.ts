import request from 'supertest';
import { OutboundDomainEventHandlerAPIServer as ApiServer } from '../../../src/api-server';
import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { Application } from 'express';

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

describe("Test the docs endpoints", () => {
    const apiServer = new ApiServer({
        port: 9999,
    }, logger);
    let app: Application;
    beforeEach(async () => {
        app = await apiServer.startServer();
    });
    afterEach(async () => {
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
});

describe("Test the unknown endpoint", () => {
    const apiServer = new ApiServer({
        port: 9999,
    }, logger);
    let app: Application;
    beforeEach(async () => {
        app = await apiServer.startServer();
    });
    afterEach(async () => {
        await apiServer.stopServer();
    });
    test("/someunknown endpoint should throw 404 error", async () => {
        const response = await request(app).get("/someunknown");
        expect(response.statusCode).toBe(404);
    });
});
