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
import { app } from '../../../../src/server/app';

jest.mock('axios');

const newSampleUser1 = {
    "email": "test1@test.com",
    "name": "test1",
    "phoneNumbers": [
      "1234567891"
    ]
}

describe("Test the users route", () => {
    let newUserId: number;
    // Happy Path
    test("Get users should return empty array", async () => {
        const response = await request(app).get('/users');
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toEqual(0);
    });
    test("Create user should work", async () => {
        const response = await request(app).post('/users').send(newSampleUser1);
        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty('id');
        newUserId = response.body.id
        expect(response.body).toHaveProperty('email');
        expect(response.body.email).toEqual(newSampleUser1.email);
        expect(response.body).toHaveProperty('name');
        expect(response.body.name).toEqual(newSampleUser1.name);
    });
    test("Get users should return an array with new user", async () => {
        const response = await request(app).get('/users');
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toEqual(1);
        expect(response.body[0]).toEqual(expect.objectContaining(newSampleUser1));
    });
    test("Get users with name filter should return an array with new user", async () => {
        const response = await request(app).get(`/users?name=${newSampleUser1.name}`);
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toEqual(1);
        expect(response.body[0]).toEqual(expect.objectContaining(newSampleUser1));
    });
    test("Get user with new user id should work", async () => {
        const response = await request(app).get(`/users/${newUserId}`);
        expect(response.body).toHaveProperty('id');
        expect(response.body.id).toEqual(newUserId);
        expect(response.body).toHaveProperty('email');
        expect(response.body.email).toEqual(newSampleUser1.email);
        expect(response.body).toHaveProperty('name');
        expect(response.body.name).toEqual(newSampleUser1.name);
    });

    //Unhappy Path
    test("Get users with invalid name", async () => {
        const response = await request(app).get(`/users?name=someinvalidname`);
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toEqual(0);
    });
    test("Get users with invalid query param", async () => {
        const response = await request(app).get(`/users?invalidparam=someinvalidvalue`);
        expect(response.statusCode).toBe(400);
    });
    test("Get user with invalid user id should throw 404 error", async () => {
        const response = await request(app).get('/users/123456');
        expect(response.statusCode).toBe(404);
    });
});
