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

const { mockAxios, jsonContentTypeHeader} = require('../../../helpers');
const { Headers } = require('@mojaloop/central-services-shared').Enum.Http;

const InboundPingModel = require('../../../../src/lib/model/InboundPingModel');
const { logger } = require('../../../../src/lib/logger');
const defaultConfig = require('./data/defaultConfig');

const createInboundPingModel = (conf = configDto()) => new InboundPingModel(conf);

const configDto = ({
    dfspId = 'mojaloop-sdk',
    jwsSign = false,
    oidc = { auth: null }
} = {}) => ({
    ...defaultConfig,
    logger,
    dfspId,
    jwsSign,
    oidc
});

const postPingParamsDto = ({
    jwsPingValidationResult,
    sourceFspId = 'sourceDfsp',
    requestId = String(Date.now()),
    headers = pingHeadersDto({ source: sourceFspId })
} = {}) => ({
    jwsPingValidationResult,
    sourceFspId,
    body: { requestId },
    headers
});

const pingHeadersDto = ({
    source = 'sourceDfsp',
    destination = configDto().dfspId,
    signature
} = {}) => ({
    ...jsonContentTypeHeader,
    [Headers.FSPIOP.SOURCE]: source,
    [Headers.FSPIOP.DESTINATION]: destination,
    ...(signature && { [Headers.FSPIOP.SIGNATURE]: signature })
});

describe.skip('InboundPingModel Tests -->', () => {
    beforeEach(() => {
        mockAxios.reset();
    });

    test('should create InboundPingModel instance with default config', () => {
        const model = createInboundPingModel();
        expect(model).toBeDefined();
    });

    test('should send successful ping callback', async () => {
        expect.hasAssertions();
        const jwsPingValidationResult = true;
        const requestId = String(Date.now());
        const sourceFspId = 'fromDfsp';
        const dfspId = 'theSDK';
        mockAxios.onPut().reply((reqConfig) => {
            expect(reqConfig.url).toBe(`/ping/${requestId}/`);
            expect(reqConfig.headers[Headers.FSPIOP.SOURCE]).toBe(dfspId);
            expect(reqConfig.headers[Headers.FSPIOP.DESTINATION]).toBe(sourceFspId);
            return [200];
        });
        const model = createInboundPingModel(configDto({ dfspId }));

        await model.postPing(postPingParamsDto({
            jwsPingValidationResult, requestId, sourceFspId
        }));
    });

    test('should send error callback, if jwsPingValidationResult is undefined (no validationKeys)', async () => {
        expect.hasAssertions();
        const requestId = String(Date.now());
        mockAxios.onPut().reply((reqConfig) => {
            expect(reqConfig.url).toBe(`/ping/${requestId}/error`);
            return [200];
        });
        const model = createInboundPingModel();
        await model.postPing(postPingParamsDto({ requestId }));
    });

    test('should send error callback, if jwsPingValidationResult is validation error', async () => {
        expect.hasAssertions();
        const jwsPingValidationResult = new Error('Validation Error');
        const requestId = String(Date.now());
        mockAxios.onPut().reply((reqConfig) => {
            expect(reqConfig.url).toBe(`/ping/${requestId}/error`);
            return [200];
        });
        const model = createInboundPingModel();
        await model.postPing(postPingParamsDto({ jwsPingValidationResult, requestId }));
    });
});

