/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2020 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Paweł Marzec - pawel.marzec@modusbox.com                         *
 **************************************************************************/

const { Logger, Transports } = require('@internal/log');

function mockLogger(context, keepQuiet) {
    // if keepQuite is undefined then be quiet
    if(keepQuiet || typeof keepQuiet === 'undefined') {
        const log = {
            log: jest.fn()
        };
        return {
            log,
            push: jest.fn(() => log)
        };
    }
    // let be elaborative and dir logging to console
    const consoleTransport = Transports.consoleDir();
    return new Logger({ context: context, space: 4, transports: [ consoleTransport ] });
}

module.exports = mockLogger;