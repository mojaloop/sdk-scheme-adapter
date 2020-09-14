/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Steven Oderayi - steven.oderayi@modusbox.com                     *
 **************************************************************************/

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { addCustomKeys } = require('@internal/openapi');

const specPath = path.join(__dirname, 'test-api.yaml');
const apiSpecs = yaml.load(fs.readFileSync(specPath));

describe('openapi', () => {
    describe('addCustomKeys', () => {
        test('should replace "pattern" key with "regexp"', async () => {
            const modifiedApiSpec = addCustomKeys(apiSpecs);
            const pattern = apiSpecs.paths['/test'].post.requestBody.content['application/json'].schema.properties.firstName.pattern;
            expect(apiSpecs).not.toEqual(modifiedApiSpec);
            expect(apiSpecs).not.toBe(modifiedApiSpec);
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.firstName.pattern).toBe(undefined);
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.firstName.regexp.pattern).toBe(pattern);
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.firstName.regexp.flags).toBe('u');
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.lastName.pattern).toBe(undefined);
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.lastName.regexp.pattern).toBe(pattern);
            expect(modifiedApiSpec.paths['/test'].post.requestBody.content['application/json'].schema.properties.lastName.regexp.flags).toBe('u');
        });
    });
});
