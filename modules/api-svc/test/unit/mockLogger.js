/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

const { Logger } = require('@mojaloop/sdk-standard-components');

function mockLogger(context, keepQuiet) {
    // if keepQuite is undefined then be quiet
    if (keepQuiet || typeof keepQuiet === 'undefined') {
        const methods = {
            // log methods
            log: jest.fn(),

            configure: jest.fn(),

            // generated methods from default levels
            verbose: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            info: jest.fn(),
            fatal: jest.fn(),

            isVerboseEnabled: jest.fn(() => true),
            isDebugEnabled: jest.fn(() => true),
            isWarnEnabled: jest.fn(() => true),
            isErrorEnabled: jest.fn(() => true),
            isTraceEnabled: jest.fn(() => true),
            isInfoEnabled: jest.fn(() => true),
            isFatalEnabled: jest.fn(() => true)
        };
        return {
            ...methods,
            push: jest.fn(() => methods)
        };
    }
    return new Logger.Logger();
}

module.exports = mockLogger;
