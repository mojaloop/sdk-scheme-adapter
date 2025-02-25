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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/

const fs  = require('fs');
const path = require('path');
const os = require('os');
const sdkSC = require('@mojaloop/sdk-standard-components');
const { createAuthClient } = require('../../src/lib/utils');

const outErrorStatusKey = 'outErrorStatusKey';

jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

jest.mock('@mojaloop/sdk-standard-components', () => ({
    WSO2Auth: jest.fn(),
    Logger: jest.requireActual('@mojaloop/sdk-standard-components').Logger,
}));

describe('config', () => {
    let certDir;
    let env;

    beforeEach(() => {
        env = { ...process.env };
        process.env.PEER_ENDPOINT = '172.17.0.3:4000';
        process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
        process.env.CACHE_URL = 'redis://172.17.0.2:6379';
        process.env.MGMT_API_WS_URL = '0.0.0.0';
        process.env.SUPPORTED_CURRENCIES = 'USD';
        certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
    });

    afterEach(() => {
        process.env = { ...env };
        fs.rmSync(certDir, { recursive: true });
        jest.resetModules();
    });

    it('correctly parses OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY when set', () => {
        process.env.OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY = outErrorStatusKey;
        const config = require('~/config');
        expect(config.outboundErrorStatusCodeExtensionKey).toEqual(outErrorStatusKey);
    });

    it('correctly parses OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY when NOT set', () => {
        delete process.env.OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY;
        const config = require('~/config');
        expect(config.outboundErrorStatusCodeExtensionKey).toBeUndefined();
    });

    it('correctly parses VALIDATE_INBOUND_PUT_PARTIES_JWS when NOT set', () => {
        delete process.env.VALIDATE_INBOUND_PUT_PARTIES_JWS;
        const config = require('~/config');
        expect(config.validateInboundPutPartiesJws).toBeFalsy();
    });

    it('correctly parses VALIDATE_INBOUND_PUT_PARTIES_JWS when set', () => {
        process.env.VALIDATE_INBOUND_PUT_PARTIES_JWS = 'true';
        const config = require('~/config');
        expect(config.validateInboundPutPartiesJws).toBeTruthy();
    });

    it('return single cert content from IN_SERVER_CERT_PATH', () => {
        const cert = path.join(certDir, 'cert.pem');
        const certContent = 'cert-data';
        fs.writeFileSync(cert, certContent);
        process.env.IN_SERVER_CERT_PATH = cert;
        const config = require('~/config');
        const content = config.inbound.tls.creds.cert.toString();
        expect(content).toBe(certContent);
    });

    it('return multiple cert content from IN_CA_CERT_PATH', () => {
        const certs = [
            path.join(certDir, 'cert1.pem'),
            path.join(certDir, 'cert2.pem'),
        ];
        const certContent = [
            'cert1-data',
            'cert2-data',
        ];
        certs.forEach((cert, index) => fs.writeFileSync(cert, certContent[index]));
        process.env.IN_CA_CERT_PATH = certs.join(',');
        const config = require('~/config');
        const content = config.inbound.tls.creds.ca.map(ca => ca.toString());
        expect(content).toStrictEqual(certContent);
    });

    it('should parse proxy config yaml file as json object', () => {
        process.env.PROXY_CONFIG_PATH = path.join(__dirname, './data/testFile.yaml');
        const config = require('~/config');
        const proxyConfig = require('./data/testFile');
        expect(config.proxyConfig).toEqual(proxyConfig);
    });

    it('should transform correctly resources versions to config', () => {
        const resourceVersions = {
            resourceOneName: {
                acceptVersion: '1',
                contentVersion: '1.0',
            },
            resourceTwoName: {
                acceptVersion: '1',
                contentVersion: '1.1',
            },

        };
        const parseResourceVersion = require('~/config').__parseResourceVersion;
        expect(parseResourceVersion('resourceOneName=1.0,resourceTwoName=1.1')).toEqual(resourceVersions);
    });

    it('should throw an err if the resource string is not correctly formed', () => {
        const parseResourceVersion = require('~/config').__parseResourceVersion;
        expect(() => parseResourceVersion('resourceOneName=1.0;resourceTwoName=1.1')).toThrowError(new Error('Resource versions format should be in format: "resourceOneName=1.0,resourceTwoName=1.1"'));
    });

    it('should return outbound.tls.creds with keys if OUTBOUND_MUTUAL_TLS_USE_FILES is true', () => {
        process.env.OUTBOUND_MUTUAL_TLS_USE_FILES = 'true';
        const config = require('~/config');
        expect(config.outbound.tls.creds).toStrictEqual({
            ca: undefined,
            cert: undefined,
            key: undefined,
        });
    });

    it('should pass outbound tlsCreds as false to WSO2Auth ctor, if OUT_USE_CERT_FILES_FOR_AUTH is false', () => {
        process.env.OAUTH_MUTUAL_TLS_ENABLED = 'false';
        const config = require('~/config');
        createAuthClient(config, {});
        const { tlsCreds } = sdkSC.WSO2Auth.mock.calls[0][0];
        expect(tlsCreds).toBe(false);
    });

    it('should read api type string ', () => {
        process.env.API_TYPE = 'iso20022';
        const config = require('~/config');
        expect(config.apiType).toBe('iso20022');
    });

    it('should default api type string to fspiop', () => {
        const config = require('~/config');
        expect(config.apiType).toBe('fspiop');
    });

    it('should have default resources version', () => {
        const config = require('~/config');
        expect(config.resourceVersions.parties.acceptVersion).toBe('2');
    });
});
