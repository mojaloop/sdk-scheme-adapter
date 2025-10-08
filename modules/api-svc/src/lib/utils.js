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

const { randomBytes } = require('node:crypto');
const { OIDCAuth } = require('@mojaloop/sdk-standard-components');

const createAuthClient = (conf, logger) => {
    const { oidc, outbound } = conf;

    const auth = new OIDCAuth({
        ...oidc.auth,
        logger,
        tlsCreds: oidc.mTlsEnabled && outbound.tls.creds,
    });

    return Object.freeze({
        auth,
        retryOidcAuthFailureTimes: oidc.requestAuthFailureRetryTimes,
    });
};

const transformIsoHeader = (headerValue, headerKey) => {
    if (headerKey.toLowerCase() === 'content-type' || headerKey.toLowerCase() === 'accept') {
        return headerValue.replace('.iso20022', '');
    }
    return headerValue;
};

const transformHeadersIsoToFspiop = (isoHeaders) => {
    const headersToTransform = ['content-type', 'accept'];
    const fspiopHeaders = {};

    Object.keys(isoHeaders).forEach((key) => {
        fspiopHeaders[key] = headersToTransform.includes(key.toLowerCase())
            ? transformIsoHeader(isoHeaders[key], key)
            : isoHeaders[key];
    });

    return fspiopHeaders;
};

/**
 * Validates trace flags according to W3C Trace Context specification
 * @param {string} flags - The trace flags to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidTraceFlags = (flags) => {
    // Must be exactly 2 characters
    if (typeof flags !== 'string' || flags.length !== 2) {
        return false;
    }
    // Must be valid hex characters (0-9, a-f, A-F)
    return /^[0-9a-fA-F]{2}$/.test(flags);
};

/**
 * Generates a W3C Trace Context compliant traceparent header
 * @param {string} [traceId] - Optional 32-character hex trace ID
 * @param {string} [traceFlags='01'] - Optional 2-character hex trace flags (defaults to '01' - sampled)
 * @returns {string} - The traceparent header value in format: version-traceId-spanId-flags
 * @throws {Error} - If traceFlags is invalid according to W3C specification
 */
const generateTraceparent = (traceId = randomBytes(16).toString('hex'), traceFlags = '01') => {
    if (!isValidTraceFlags(traceFlags)) {
        throw new Error(`Invalid trace flags: '${traceFlags}'. Must be a two-character hex string (00-ff).`);
    }
    const spanId = randomBytes(8).toString('hex');
    return `00-${traceId}-${spanId}-${traceFlags.toLowerCase()}`;
};

module.exports = {
    createAuthClient,
    generateTraceparent,
    isValidTraceFlags,
    transformHeadersIsoToFspiop
};
