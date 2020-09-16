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
            const pattern = apiSpecs.components.schemas.ComplexName.pattern;
            expect(apiSpecs).not.toEqual(modifiedApiSpec);
            expect(modifiedApiSpec.components.schemas.ComplexName.pattern).toBe(undefined);
            expect(modifiedApiSpec.components.schemas.ComplexName.regexp.pattern).toBe(pattern);
            expect(modifiedApiSpec.components.schemas.ComplexName.regexp.flags).toBe('u');
            expect(modifiedApiSpec.components.schemas.ComplexName.pattern).toBe(undefined);
            expect(modifiedApiSpec.components.schemas.ComplexName.regexp.pattern).toBe(pattern);
            expect(modifiedApiSpec.components.schemas.ComplexName.regexp.flags).toBe('u');
        });
    });
});
