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


const { Logger, Transports } = require('@internal/log');



describe('Logger', () => {

    test('logs non-circular without throwing', async () => {
        const transports = await Promise.all([Transports.consoleDir()]);

        let logger = new Logger({
            context: {
                app: 'test'
            },
            space: 4,
            transports,
        });

        const testOb = {
            a: 'test',
            b: 123,
            c: [1, 2, 3]
        };

        try {
            logger = logger.push(testOb);
            await logger.log('This is a test');
        }
        catch(e) {
            expect(e).toBe(undefined); 
        }
    });


    test('logs circular without throwing', async () => {
        const transports = await Promise.all([Transports.consoleDir()]);

        let logger = new Logger({
            context: {
                app: 'test'
            },
            space: 4,
            transports,
        });

        const testOb = {
            a: 'test',
            b: 123,
            c: [1, 2, 3]
        };

        // create a circular reference in testOb
        testOb.d = testOb;

        try {
            logger = logger.push(testOb);
            await logger.log('This is a test');
        }
        catch(e) {
            expect(e).toBe(undefined); 
        }
    });

});
