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
 - Name Surname <name.surname@mojaloop.io>

 * Modusbox
 - Paweł Marzec <pawel.marzec@modusbox.com>
 --------------
 ******/

const { logger } = require('../../src/lib/logger');

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
            // fatal: jest.fn(),
            // todo: add all methods from ContextLogger

            isVerboseEnabled: jest.fn(() => true),
            isDebugEnabled: jest.fn(() => true),
            isWarnEnabled: jest.fn(() => true),
            isErrorEnabled: jest.fn(() => true),
            isTraceEnabled: jest.fn(() => true),
            isInfoEnabled: jest.fn(() => true),
            // isFatalEnabled: jest.fn(() => true)
        };
        const mockLogger = ({
            ...methods,
            push: jest.fn(() => mockLogger),
            child: jest.fn(() => mockLogger)
        });

        return mockLogger;
    }
    return logger.push({ component: 'mockLogger' });
}

module.exports = mockLogger;
