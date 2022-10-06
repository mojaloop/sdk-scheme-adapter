/******************************************************************************
 *  Copyright 2019 ModusBox, Inc.                                             *
 *                                                                            *
 *  info@modusbox.com                                                         *
 *                                                                            *
 *  Licensed under the Apache License, Version 2.0 (the "License");           *
 *  you may not use this file except in compliance with the License.          *
 *  You may obtain a copy of the License at                                   *
 *  http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                            *
 *  Unless required by applicable law or agreed to in writing, software       *
 *  distributed under the License is distributed on an "AS IS" BASIS,         *
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 *  See the License for the specific language governing permissions and       *
 *  limitations under the License                                             *
 ******************************************************************************/

import { Server } from 'http';
import { OutboundCommandEventHandlerAPIServer as ApiServer } from '../../../src/api-server';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { IBulkTransactionEntityRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

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
        port: 9999,
        bulkTransactionEntityRepo: {
            canCall: jest.fn()
        } as IBulkTransactionEntityRepo,
    }, logger);
    test("startServer should return a resolved promise", async () => {
        await expect(apiServer.startServer()).resolves.toBe(undefined);
    });
    test("stopServer should return a resolved promise", async () => {
        await expect(apiServer.stopServer()).resolves.toBe(undefined);
    });
});
