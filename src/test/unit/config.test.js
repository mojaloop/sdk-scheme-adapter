/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

const fs  = require('fs');
const path = require('path');
const os = require('os');

jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

describe('config', () => {
    let certDir;
    let env;

    beforeEach(() => {
        env = { ...process.env };
        process.env.PEER_ENDPOINT = '172.17.0.3:4000';
        process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
        process.env.CACHE_HOST = '172.17.0.2';
        process.env.CACHE_PORT = '6379';
        certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-'));
    });

    afterEach(() => {
        process.env = { ...env };
        fs.rmdirSync(certDir, { recursive: true });
        jest.resetModules();
    });

    it('return single cert content from IN_SERVER_CERT_PATH', () => {
        const cert = path.join(certDir, 'cert.pem');
        const certContent = 'cert-data';
        fs.writeFileSync(cert, certContent);
        process.env.IN_SERVER_CERT_PATH = cert;
        const config = require('../../config');
        const content = config.tls.inbound.creds.cert.toString();
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
        const config = require('../../config');
        const content = config.tls.inbound.creds.ca.map(ca => ca.toString());
        expect(content).toStrictEqual(certContent);
    });
});
