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

import request from 'supertest';
import axios from 'axios';
import { app } from '../../../../src/server/app';
import Config from '../../../../src/shared/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Test the health route without mock service", () => {
    test("Health endpoint should work", async () => {
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toEqual('OK');
    });
});

describe("Test the health route with mock service enabled", () => {
    test("Happy path", async () => {
        Config.set('GET_DATA_FROM_MOCK_SERVICE', true);
        mockedAxios.get.mockResolvedValueOnce({})
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toEqual('OK');
    });
    test("Unhappy path", async () => {
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