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
require('dotenv').config({
    path: '../../.env.example',
});

process.env.PEER_ENDPOINT = process.env.PEER_ENDPOINT || 'localhost:4000';
process.env.BACKEND_ENDPOINT = process.env.BACKEND_ENDPOINT || 'localhost:4000';
process.env.CACHE_URL = process.env.CACHE_URL || 'redis://localhost:6379';
process.env.MGMT_API_WS_URL = process.env.MGMT_API_WS_URL || 'localhost';
process.env.SUPPORTED_CURRENCIES = process.env.SUPPORTED_CURRENCIES || 'USD';
