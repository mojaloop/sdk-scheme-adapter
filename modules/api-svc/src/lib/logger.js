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
 * Eugen Klymniuk <eugen.klymniuk@infitx.com>

 --------------
 ******/

const { hostname } = require('node:os');
const { ContextLogger } = require('@mojaloop/central-services-logger/src/contextLogger');
const { allLevels } = require('@mojaloop/central-services-logger/src/lib/constants');

const LOG_LEVELS = Object.keys(allLevels);

const createLogger = (conf = {}) => {
    const {
        context = {
            // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
            simulator: process.env['SIM_NAME'],
            hostname: hostname(),
        },
        isJsonOutput = false,
    } = conf;

    return new SdkLogger(context, { jsonOutput: isJsonOutput });
};

class SdkLogger extends ContextLogger {
    // todo: - update ContextLogger.child() to be able to use it in SdkLogger
    //       - add log() method to ContextLogger
    //       - think about adding logLevel to ContextLoggerOptions
    //       - export logLevels from ContextLogger (?)
    child(context) {
        const { mlLogger } = this;
        const childContext = this.createContext(context);
        return new SdkLogger(Object.assign({}, this.context, childContext), { mlLogger });
    }

    push(context) {
        return this.child(context);
    }

    log(message, meta = null) {
        this.silly(message, meta);
    }
}

module.exports = {
    createLogger,
    SdkLogger,
    LOG_LEVELS,
};
