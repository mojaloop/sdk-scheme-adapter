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
const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const createAuthClient = (conf, logger) => {
    const { wso2, outbound } = conf;

    const auth = new WSO2Auth({
        ...wso2.auth,
        logger,
        tlsCreds: wso2.mTlsEnabled && outbound.tls.creds,
    });

    return Object.freeze({
        auth,
        retryWso2AuthFailureTimes: wso2.requestAuthFailureRetryTimes,
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

const generateTraceparent = (traceId = randomBytes(16).toString('hex')) => {
    const spanId = randomBytes(8).toString('hex');
    const flags = '01';
    return `00-${traceId}-${spanId}-${flags}`;
};

module.exports = {
    createAuthClient,
    generateTraceparent,
    transformHeadersIsoToFspiop
};
