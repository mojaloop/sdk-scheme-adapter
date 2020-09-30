/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

const { Logger } = require('@mojaloop/sdk-standard-components');

describe('Logger', () => {

    test('logs non-circular without throwing', async () => {
        let logger = new Logger.Logger({ context: { app: 'test' } });

        const testOb = {
            a: 'test',
            b: 123,
            c: [1, 2, 3]
        };

        expect(() => logger.push(testOb).log('This is a test')).not.toThrow();
    });


    test('logs circular without throwing', async () => {
        let logger = new Logger.Logger({ context: { app: 'test' } });

        const testOb = {
            a: 'test',
            b: 123,
            c: [1, 2, 3]
        };

        // create a circular reference in testOb
        testOb.d = testOb;

        expect(() => logger.push(testOb).log('This is a test')).not.toThrow();
    });

});
