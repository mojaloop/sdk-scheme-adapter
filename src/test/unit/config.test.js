/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

require('dotenv').config({path: 'local.env'});

const fs  = require('fs').promises;
const path = require('path');
const config = require('../../config');
const defaultConfig = require('./data/defaultConfig');

describe('config', () => {
    let defConfig;

    beforeAll(async () => {
        // the keys are under the "secrets" folder that is supposed to be moved by Dockerfile
        // so for the needs of the unit tests, we have to define the proper path manually.
        process.env.JWS_SIGNING_KEY_PATH = path.join('..', 'secrets', process.env.JWS_SIGNING_KEY_PATH);
        process.env.JWS_VERIFICATION_KEYS_DIRECTORY = path.join('..', 'secrets', process.env.JWS_VERIFICATION_KEYS_DIRECTORY);
    });

    beforeEach(() => {
        defConfig = JSON.parse(JSON.stringify(defaultConfig));
    });

    describe('Public functions:', () => {
        describe('getConfig:', () => {
            describe('Failures:', () => {
                // no failure scenarios to test
            });

            describe('Success:', () => {
                it('returns the configuration object.', () => {
                    const retrievedConfig = config.getConfig();

                    expect(retrievedConfig).toEqual(defConfig);
                });
            });
        });

        describe('setConfig:', () => {
            beforeEach(() => {
                config.init();
            });

            afterEach(() => {
                config.destroy();
            });

            describe('Failures:', () => {
                describe('it throws an exception if the passed parameter is:',  () => {
                    it('empty.', async () => {
                        await expect(config.setConfig()).rejects.toThrow();
                    });

                    it('null.', async () => {
                        await expect(config.setConfig(null)).rejects.toThrow();
                    });

                    it('number.', async () => {
                        await expect(config.setConfig(12345)).rejects.toThrow();
                    });

                    it('string.', async () => {
                        await expect(config.setConfig('foo')).rejects.toThrow();
                    });

                    it('function.', async () => {
                        await expect(config.setConfig(function() {})).rejects.toThrow();
                    });
                });
            });

            describe('Success:', () => {
                let mockFilePath;

                beforeEach(() => {
                    let retrievedConfig = config.getConfig();

                    expect(retrievedConfig).toEqual(defConfig);
                });

                afterEach(async () => {
                    if (mockFilePath) {
                        await fs.unlink(mockFilePath);
                        mockFilePath = null;
                    }
                });

                it('overwrites the default values with those in the passed object.',  async () => {
                    await config.setConfig(process.env);

                    let retrievedConfig = config.getConfig();

                    expect(retrievedConfig).not.toEqual(defConfig);
                    expect(retrievedConfig.inboundPort).toBe(process.env.INBOUND_LISTEN_PORT);
                    expect(retrievedConfig.outboundPort).toBe(process.env.OUTBOUND_LISTEN_PORT);
                    expect(retrievedConfig.peerEndpoint).toBe(process.env.PEER_ENDPOINT);
                    expect(retrievedConfig.backendEndpoint).toBe(process.env.BACKEND_ENDPOINT);
                    expect(retrievedConfig.dfspId).toBe(process.env.DFSP_ID);
                    expect(retrievedConfig.ilpSecret).toBe(process.env.ILP_SECRET);
                    expect(retrievedConfig.expirySeconds).toBe(Number(process.env.EXPIRY_SECONDS));
                    expect(retrievedConfig.autoAcceptQuotes).toBe(process.env.AUTO_ACCEPT_QUOTES === 'true');
                    expect(retrievedConfig.checkIlp).toBe(process.env.CHECK_ILP === 'true');
                    expect(retrievedConfig.cacheConfig.host).toBe(process.env.CACHE_HOST);
                    expect(retrievedConfig.cacheConfig.port).toBe(process.env.CACHE_PORT);
                    expect(retrievedConfig.enableTestFeatures).toBe(process.env.ENABLE_TEST_FEATURES === 'true');
                    expect(retrievedConfig.wso2Auth.staticToken).toBe(process.env.WS02_BEARER_TOKEN);
                    expect(retrievedConfig.jwsVerificationKeysDirectory).toBe(process.env.JWS_VERIFICATION_KEYS_DIRECTORY);
                    expect(Buffer.isBuffer(retrievedConfig.jwsSigningKey)).toBe(true);
                    expect(typeof(retrievedConfig.jwsVerificationKeys)).toBe('object');
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(1);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');
                });

                it('updates configuration object when a new JWS verification key '
                    + 'is added to the target monitored folder.', async () => {
                    await config.setConfig(process.env);

                    let retrievedConfig = config.getConfig();

                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(1);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');

                    mockFilePath = path.join(retrievedConfig.jwsVerificationKeysDirectory,
                        'mock-jws.pem');

                    await fs.writeFile(mockFilePath, 'foo-key');

                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(2);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[1]).toBe('mock-jws');
                });

                it('updates configuration object when a new JWS verification key '
                    + 'is removed to the target monitored folder.', async () => {
                    await config.setConfig(process.env);

                    let retrievedConfig = config.getConfig();

                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(1);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');

                    mockFilePath = path.join(retrievedConfig.jwsVerificationKeysDirectory,
                        'mock-jws.pem');

                    await fs.writeFile(mockFilePath, 'foo-key');

                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(2);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[1]).toBe('mock-jws');

                    await fs.unlink(mockFilePath);
                    mockFilePath = null;

                    expect(Object.keys(retrievedConfig.jwsVerificationKeys).length).toBe(1);
                    expect(Object.keys(retrievedConfig.jwsVerificationKeys)[0]).toBe('mojaloop-sdk');
                });
            });
        });
    });
});
