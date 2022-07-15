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

/* Example
 * 
 * This is an example Jest unit test for express app.
 * 
 */
import request from 'supertest';
import { app } from '../../../src/server/app';

describe("Test the docs endpoints", () => {
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
    test("/someunknown endpoint should throw 404 error", async () => {
        const response = await request(app).get("/someunknown");
        expect(response.statusCode).toBe(404);
    });
});