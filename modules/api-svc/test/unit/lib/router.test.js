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

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES = 'USD';

const router = require('~/lib/router');
const mockLogger = require('../mockLogger');

describe('router', () => {
    describe('handler not found', () => {
        test('should return statusCode as string "404" when no handler is found', async () => {
            const handlerMap = {
                '/transfers': {
                    get: jest.fn()
                }
            };

            const routerMiddleware = router(handlerMap, {});

            const ctx = {
                method: 'POST',
                state: {
                    path: {
                        pattern: '/unknown'
                    },
                    logger: mockLogger()
                },
                response: {
                    status: null,
                    body: null
                }
            };

            const next = jest.fn();

            await routerMiddleware(ctx, next);

            expect(ctx.response.status).toBe(404);
            expect(ctx.response.body).toEqual({
                statusCode: '404',
                message: 'Not found'
            });
            expect(ctx.response.body.statusCode).toBe('404');
            expect(typeof ctx.response.body.statusCode).toBe('string');
            expect(next).toHaveBeenCalled();
        });

        test('should return statusCode as string "404" when handler exists but method not supported', async () => {
            const handlerMap = {
                '/transfers': {
                    get: jest.fn()
                }
            };

            const routerMiddleware = router(handlerMap, {});

            const ctx = {
                method: 'POST',
                state: {
                    path: {
                        pattern: '/transfers'
                    },
                    logger: mockLogger()
                },
                response: {
                    status: null,
                    body: null
                }
            };

            const next = jest.fn();

            await routerMiddleware(ctx, next);

            expect(ctx.response.status).toBe(404);
            expect(ctx.response.body).toEqual({
                statusCode: '404',
                message: 'Not found'
            });
            expect(typeof ctx.response.body.statusCode).toBe('string');
        });

        test('should call handler when found', async () => {
            const mockHandler = jest.fn(async (ctx) => {
                ctx.response.status = 200;
                ctx.response.body = { success: true };
            });

            const handlerMap = {
                '/transfers': {
                    post: mockHandler
                }
            };

            const routerMiddleware = router(handlerMap, {});

            const ctx = {
                method: 'POST',
                state: {
                    path: {
                        pattern: '/transfers'
                    },
                    logger: mockLogger()
                },
                response: {
                    status: null,
                    body: null
                }
            };

            const next = jest.fn();

            await routerMiddleware(ctx, next);

            expect(mockHandler).toHaveBeenCalledWith(ctx);
            expect(ctx.response.status).toBe(200);
            expect(next).toHaveBeenCalled();
        });
    });

    describe('multiDfsp mode', () => {
        test('should prepend {dfspId} to routes when multiDfsp is enabled', async () => {
            const mockHandler = jest.fn(async (ctx) => {
                ctx.response.status = 200;
            });

            const handlerMap = {
                '/transfers': {
                    post: mockHandler
                }
            };

            const routerMiddleware = router(handlerMap, { multiDfsp: true });

            const ctx = {
                method: 'POST',
                state: {
                    path: {
                        pattern: '/{dfspId}/transfers'
                    },
                    logger: mockLogger()
                },
                response: {
                    status: null,
                    body: null
                }
            };

            const next = jest.fn();

            await routerMiddleware(ctx, next);

            expect(mockHandler).toHaveBeenCalledWith(ctx);
            expect(ctx.response.status).toBe(200);
        });

        test('should return 404 with string statusCode in multiDfsp mode when handler not found', async () => {
            const handlerMap = {
                '/transfers': {
                    get: jest.fn()
                }
            };

            const routerMiddleware = router(handlerMap, { multiDfsp: true });

            const ctx = {
                method: 'POST',
                state: {
                    path: {
                        pattern: '/{dfspId}/unknown'
                    },
                    logger: mockLogger()
                },
                response: {
                    status: null,
                    body: null
                }
            };

            const next = jest.fn();

            await routerMiddleware(ctx, next);

            expect(ctx.response.status).toBe(404);
            expect(ctx.response.body).toEqual({
                statusCode: '404',
                message: 'Not found'
            });
            expect(typeof ctx.response.body.statusCode).toBe('string');
        });
    });
});
