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

const { Ilp } = jest.requireActual('@mojaloop/sdk-standard-components');
const { createLogger } = require('../../src/lib/logger');
const mocks = require('./lib/model/data/mocks');

describe('ILP Tests -->', () => {
    let ilp;
    let fxQuotesPayload;
    let fxpBeResponse;

    beforeEach(() => {
        ilp = Ilp.ilpFactory(Ilp.ILP_VERSIONS.v4, {
            secret: 'test',
            logger: createLogger(),
        });
        fxQuotesPayload = mocks.mockFxQuotesPayload();
        fxpBeResponse = mocks.mockFxQuotesInternalResponse();
    });

    test('should generate ILP response based on fxQuotes request/response', () => {
        const {
            ilpPacket,
            fulfilment,
            condition
        } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);

        expect(ilpPacket).toBeTruthy();
        expect(fulfilment).toBeTruthy();
        expect(condition).toBeTruthy();
    });

    test('should generate proper ILP packet for fxQuote', () => {
        const { ilpPacket } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);

        const decodedIlp = ilp.decodeIlpPacket(ilpPacket);
        expect(decodedIlp).toBeTruthy();
        expect(typeof decodedIlp.amount).toBe('string');
        expect(typeof decodedIlp.destination).toBe('string');
        expect(decodedIlp.data).toBeInstanceOf(Buffer);
        expect(decodedIlp.expiresAt).toBeInstanceOf(Date);
        expect(decodedIlp.executionCondition).toBeInstanceOf(Buffer);

        const decodedJson = JSON.parse(Buffer.from(decodedIlp.data.toString(), 'base64').toString());
        const { conversionRequestId } = fxQuotesPayload;
        const { conversionTerms } = fxpBeResponse;
        const transactionObject = {
            conversionRequestId,
            conversionTerms
        };
        expect(decodedJson).toEqual(transactionObject);
    });

    test('should generate ILP v4 packet with proper condition for FX', () => {
        const { ilpPacket, condition } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);
        const { executionCondition } = ilp.decodeIlpPacket(ilpPacket);
        expect(executionCondition).toBeInstanceOf(Buffer);
        expect(condition).toBe(executionCondition.toString('base64url'));
    });
});

