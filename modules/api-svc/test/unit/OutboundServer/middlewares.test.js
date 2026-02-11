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

const { createRequestValidator } = require('~/OutboundServer/middlewares');
const mockLogger = require('../mockLogger');

describe('OutboundServer middlewares', () => {
    describe('createRequestValidator', () => {
        test('should return statusCode as string "400" on validation error', async () => {
            // Create a mock validator that throws a validation error
            const validator = {
                validateRequest: jest.fn(() => {
                    const error = new Error('Invalid request body');
                    error.dataPath = '.body.amount';
                    throw error;
                })
            };

            const middleware = createRequestValidator(validator);

            // Create a mock Koa context
            const ctx = {
                request: {
                    method: 'POST',
                    path: '/transfers',
                    id: 'test-request-id'
                },
                state: {
                    logger: mockLogger(),
                    logExcludePaths: []
                },
                response: {
                    status: null,
                    body: null
                },
                path: '/transfers'
            };

            const next = jest.fn();

            // Execute the middleware
            await middleware(ctx, next);

            // Assertions
            expect(ctx.response.status).toBe(400);
            expect(ctx.response.body).toEqual({
                message: '.body.amount Invalid request body',
                statusCode: '400'
            });
            expect(ctx.response.body.statusCode).toBe('400');
            expect(typeof ctx.response.body.statusCode).toBe('string');
            expect(next).not.toHaveBeenCalled();
        });

        test('should return statusCode as string without dataPath', async () => {
            const validator = {
                validateRequest: jest.fn(() => {
                    const error = new Error('Missing required field');
                    throw error;
                })
            };

            const middleware = createRequestValidator(validator);

            const ctx = {
                request: {
                    method: 'POST',
                    path: '/transfers',
                    id: 'test-request-id'
                },
                state: {
                    logger: mockLogger(),
                    logExcludePaths: []
                },
                response: {
                    status: null,
                    body: null
                },
                path: '/transfers'
            };

            const next = jest.fn();

            await middleware(ctx, next);

            expect(ctx.response.status).toBe(400);
            expect(ctx.response.body).toEqual({
                message: 'Missing required field',
                statusCode: '400'
            });
            expect(typeof ctx.response.body.statusCode).toBe('string');
        });

        test('should proceed to next middleware on valid request', async () => {
            const validator = {
                validateRequest: jest.fn(() => ({
                    pattern: '/transfers',
                    params: {}
                }))
            };

            const middleware = createRequestValidator(validator);

            const ctx = {
                request: {
                    method: 'POST',
                    path: '/transfers',
                    id: 'test-request-id'
                },
                state: {
                    logger: mockLogger(),
                    logExcludePaths: []
                },
                response: {
                    status: null,
                    body: null
                },
                path: '/transfers'
            };

            const next = jest.fn();

            await middleware(ctx, next);

            expect(next).toHaveBeenCalled();
            expect(ctx.state.path).toEqual({
                pattern: '/transfers',
                params: {}
            });
        });
    });
});
