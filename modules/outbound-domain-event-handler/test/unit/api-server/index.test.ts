import { Server } from 'http';
import { OutboundDomainEventHandlerAPIServer as ApiServer } from '../../../src/api-server';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { IBulkTransactionEntityReadOnlyRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion');

jest.mock('../../../src/api-server/app', () => {
    return {
        app: {
            listen: (_port: number, callbackFn: any) => { callbackFn(); return Server; }
        }
    }
});
jest.mock('http', () => {
    return {
        Server: {
            close: (callbackFn: any) => { callbackFn(); }
        }
    }
});

describe.skip("Start and Stop API Server", () => {
    const apiServer = new ApiServer({
        port: 10999,
        bulkTransactionEntityRepo: {
            canCall: jest.fn()
        }  as IBulkTransactionEntityReadOnlyRepo,
    }, logger);
    test("startServer should return a resolved promise", async () => {
        await expect(apiServer.startServer()).resolves.toBe(undefined);
    });
    test("stopServer should return a resolved promise", async () => {
        await expect(apiServer.stopServer()).resolves.toBe(undefined);
    });
});
