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

 * Eugen Klymniuk <eugen.klymniuk@infitx.com>
 --------------
 **********/

jest.unmock('@mojaloop/sdk-standard-components');

const { mockAxios } = require('../../../../../helpers');
const { logger } = require('~/lib/logger');

const { BackendRequests, HTTPResponseError } = require('../../../../../../src/lib/model/lib/requests');
const defaultConfig = require('../../data/defaultConfig');

const config = {
    ...defaultConfig,
    logger,
};

describe('backendRequests Tests -->', () => {
    let br;

    beforeEach(() => {
        mockAxios.reset();
        br = new BackendRequests(config);
    });

    test('should handle success response', async () => {
        const partyInfo = { success: true };
        mockAxios.onGet().reply(200, partyInfo, {});

        const data = await br.getParties('idType', 'idValue', 'idSubValue');
        expect(data).toEqual(partyInfo);
    });


    test('should rethrow HTTPResponseError error on erroneous response', async () => {
        expect.hasAssertions();
        const noPartyResponse = {
            statusCode: '4001',
            message: 'Party Not Found in the backend application'
        };
        mockAxios.onGet().reply(404, noPartyResponse);

        await br.getParties('idType', 'idValue', 'idSubValue').catch(err => {
            expect(err).toBeInstanceOf(HTTPResponseError);
            expect(err.message).toBe('Request failed with status code 404');
            const { res } = err.getData();
            expect(res.data).toEqual(noPartyResponse);
        });
    });
});
