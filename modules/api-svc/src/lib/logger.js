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

const { loggerFactory, LOG_LEVELS } = require('@mojaloop/sdk-standard-components').Logger;

const createLogger = (conf = {}) => {
    const {
        context = {
            context: 'SDK',
            // If we're running from a Mojaloop helm chart deployment, we'll have a SIM_NAME
            simulator: process.env['SIM_NAME'],
        },
        isJsonOutput = false,
    } = conf;

    return loggerFactory({ context, isJsonOutput });
};

const logger = createLogger(); // global logger

module.exports = {
    logger,
    LOG_LEVELS,
};
