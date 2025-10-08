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
const { transformHeadersIsoToFspiop, generateTraceparent, isValidTraceFlags } = require('~/lib/utils');

describe('utils', () => {
    describe('transformHeadersIsoToFspiop', () => {
        it('should transform headers', () => {
            const isoHeaders = {
                'content-type': 'application/vnd.interoperability.iso20022.transfers+json;version=2',
                'accept': 'application/vnd.interoperability.iso20022.transfers+json;version=2.0',
                'date': '2021-08-23T15:00:00.000Z'
            };
            const fspiopHeaders = {
                'content-type': 'application/vnd.interoperability.transfers+json;version=2',
                'accept': 'application/vnd.interoperability.transfers+json;version=2.0',
                'date': '2021-08-23T15:00:00.000Z'
            };
            expect(transformHeadersIsoToFspiop(isoHeaders)).toEqual(fspiopHeaders);
        });
    });

    describe('isValidTraceFlags', () => {
        it('should validate correct hex strings', () => {
            expect(isValidTraceFlags('00')).toBe(true);
            expect(isValidTraceFlags('01')).toBe(true);
        });

        it('should reject invalid strings', () => {
            expect(isValidTraceFlags('0')).toBe(false);      // Too short
            expect(isValidTraceFlags('000')).toBe(false);    // Too long
            expect(isValidTraceFlags('zz')).toBe(false);     // Invalid hex
            expect(isValidTraceFlags('')).toBe(false);       // Empty string
        });

        it('should reject non-string inputs', () => {
            expect(isValidTraceFlags(null)).toBe(false);
            expect(isValidTraceFlags(undefined)).toBe(false);
            expect(isValidTraceFlags(1)).toBe(false);
            expect(isValidTraceFlags({})).toBe(false);
        });
    });

    describe('generateTraceparent', () => {
        describe('default behavior', () => {
            it('should generate valid traceparent with default flags (01)', () => {
                const traceparent = generateTraceparent();
                const parts = traceparent.split('-');

                expect(parts).toHaveLength(4);
                expect(parts[0]).toBe('00');           // version
                expect(parts[1]).toHaveLength(32);     // traceId (16 bytes = 32 hex chars)
                expect(parts[2]).toHaveLength(16);     // spanId (8 bytes = 16 hex chars)
                expect(parts[3]).toBe('01');           // default flags

                // Validate hex format
                expect(/^[0-9a-f]{32}$/.test(parts[1])).toBe(true);
                expect(/^[0-9a-f]{16}$/.test(parts[2])).toBe(true);
            });

            it('should use provided traceId', () => {
                const traceId = '1234567890abcdef1234567890abcdef';
                const traceparent = generateTraceparent(traceId);
                const parts = traceparent.split('-');

                expect(parts[1]).toBe(traceId);
            });
        });

        describe('custom trace flags', () => {
            it('should use custom trace flags when provided', () => {
                const traceparent = generateTraceparent(undefined, '00');
                expect(traceparent.split('-')[3]).toBe('00');
            });

            it('should accept uppercase hex and convert to lowercase', () => {
                const traceparent = generateTraceparent(undefined, 'FF');
                expect(traceparent.split('-')[3]).toBe('ff');
            });
        });

        describe('validation', () => {
            it('should throw error for invalid trace flags', () => {
                expect(() => generateTraceparent(undefined, '0')).toThrow();
                expect(() => generateTraceparent(undefined, '000')).toThrow();
                expect(() => generateTraceparent(undefined, 'zz')).toThrow();
            });

        });

    });
});
