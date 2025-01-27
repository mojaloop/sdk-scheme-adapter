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

 --------------
 ******/
const { defaultProtocolResources } = require('@mojaloop/central-services-shared').Util.Hapi.FSPIOPHeaderValidation;

const defaultVersion = '2.0';
const RESOURCE_VERSIONS_STRING = defaultProtocolResources
    .map(r => `${r}=${defaultVersion}`)
    .join(',');

const ISO_20022_HEADER_PART = 'iso20022';

const API_TYPES = Object.freeze({
    fspiop: 'fspiop',
    iso20022: 'iso20022',
});

const SDK_LOGGER_HIERARCHY = ['verbose', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

module.exports = {
    API_TYPES,
    ISO_20022_HEADER_PART,
    RESOURCE_VERSIONS_STRING,
    SDK_LOGGER_HIERARCHY,
};
