/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

require('dotenv').config();
const fs = require('fs');
const { from } = require('env-var');
const { LOG_LEVELS } = require('../../../../src/lib/logger');

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
    logLevel: env.get('LOG_LEVEL').default('info').asEnum(LOG_LEVELS),
    server: {
        port: env.get('SERVER_LISTEN_PORT').default('4005').asPortNumber(),
    },
    testAPIServer: {
        port: env.get('TEST_LISTEN_PORT').default('5005').asPortNumber(),
    },
};
