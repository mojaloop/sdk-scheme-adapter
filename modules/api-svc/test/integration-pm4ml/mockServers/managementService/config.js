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

const fs = require('fs');
require('dotenv').config();
const { from } = require('env-var');

function getFileContent (path) {
    if (!fs.existsSync(path)) {
        throw new Error('File doesn\'t exist');
    }
    return fs.readFileSync(path);
}

const env = from(process.env, {
    asFileContent: (path) => getFileContent(path),
    asFileListContent: (pathList) => pathList.split(',').map((path) => getFileContent(path)),
});

module.exports = {
    logLevel: env.get('LOG_LEVEL').default('info').asEnum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
    server: {
        port: env.get('SERVER_LISTEN_PORT').default('4005').asPortNumber(),
    },
    testAPIServer: {
        port: env.get('TEST_LISTEN_PORT').default('5005').asPortNumber(),
    },
};
