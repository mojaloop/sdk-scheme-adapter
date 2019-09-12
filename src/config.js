/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/
'use strict';

const fs = require('fs');
const path = require('path');

const FS_EVENT_TYPES = {
    CHANGE: 'change',
    RENAME: 'rename'
};

// TODO: implement toString, toJSON toAnythingElse methods on config so that secrets can't be
// printed
let DEFAULTS = {
    inboundPort: 4000,
    outboundPort: 4001,
    peerEndpoint: '172.17.0.2:3001',
    backendEndpoint: '172.17.0.2:3001',
    dfspId: 'mojaloop-sdk',
    ilpSecret: 'mojaloop-sdk',
    checkIlp: true,
    expirySeconds: 60,
    autoAcceptQuotes: true,
    tls: {
        mutualTLS: {enabled: false},
        inboundCreds: {
            ca: null,
            cert: null,
            key: null
        },
        outboundCreds: {
            ca: null,
            cert: null,
            key: null
        }
    },
    validateInboundJws: true,
    jwsSign: true,
    jwsSigningKey: null,
    jwsVerificationKeysDirectory: null,
    cacheConfig: {
        host: 'localhost',
        port: 6379
    },
    enableTestFeatures: false,
    wso2Auth: {
        refreshSeconds: 3600,
    }
};

let config = {};
let fsWatcher;

// A promise wrapper around fs.readFile
// Redundant on node 10 and above, use require('fs').promises instead
async function readFile(...args) {
    const p = new Promise((resolve, reject) => {
        fs.readFile(...args, (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(data);
        });
    });
    return p;
}

async function readFilesDelimitedList(delimiter, list) {
    return Promise.all(list.split(delimiter).map(filename => readFile(filename)));
}

const init = () => {
    // do not copy by reference, but perform a deep clone of the object to avoid modifying
    // the DEFAULTS.
    // Useful for avoiding issues in case this and the `setConfig` are called multiple times,
    // like in unit tests.
    config = JSON.parse(JSON.stringify(DEFAULTS));
};

// initialize the config object with the DEFAULTS before any action is performed.
init();

const setConfig = async cfg => {
    config.inboundPort = cfg.INBOUND_LISTEN_PORT;
    config.outboundPort = cfg.OUTBOUND_LISTEN_PORT;
    config.tls.mutualTLS.enabled = cfg.MUTUAL_TLS_ENABLED.toLowerCase() === 'false' ? false : true;

    config.peerEndpoint = cfg.PEER_ENDPOINT;
    config.backendEndpoint = cfg.BACKEND_ENDPOINT;

    config.dfspId = cfg.DFSP_ID;
    config.ilpSecret = cfg.ILP_SECRET;
    config.checkIlp = cfg.CHECK_ILP.toLowerCase() === 'false' ? false : true;
    config.expirySeconds = Number(cfg.EXPIRY_SECONDS);
    config.autoAcceptQuotes = cfg.AUTO_ACCEPT_QUOTES.toLowerCase() === 'true' ? true : false;

    // Getting secrets from files instead of environment variables reduces the likelihood of
    // accidental leakage.
    if (config.tls.mutualTLS.enabled) {
        // read inbound certs/keys
        [config.tls.inboundCreds.ca, config.tls.inboundCreds.cert, config.tls.inboundCreds.key] = await Promise.all([
            readFilesDelimitedList(',', cfg.IN_CA_CERT_PATH),
            readFile(cfg.IN_SERVER_CERT_PATH),
            readFile(cfg.IN_SERVER_KEY_PATH)
        ]);

        //read outbound certs/keys
        [config.tls.outboundCreds.ca, config.tls.outboundCreds.cert, config.tls.outboundCreds.key] = await Promise.all([
            readFilesDelimitedList(',', cfg.OUT_CA_CERT_PATH),
            readFile(cfg.OUT_CLIENT_CERT_PATH),
            readFile(cfg.OUT_CLIENT_KEY_PATH)
        ]);
    }

    config.validateInboundJws = cfg.VALIDATE_INBOUND_JWS.toLowerCase() === 'false' ? false : true;
    config.jwsSign = cfg.JWS_SIGN.toLowerCase() === 'false' ? false : true;
    config.jwsSigningKey = await readFile(cfg.JWS_SIGNING_KEY_PATH);
    config.jwsVerificationKeysDirectory = cfg.JWS_VERIFICATION_KEYS_DIRECTORY;

    config.jwsVerificationKeys = {};

    // read files on startup.
    fs.readdirSync(cfg.JWS_VERIFICATION_KEYS_DIRECTORY)
        .filter(f => f.endsWith('.pem'))
        .map(f => {
            config.jwsVerificationKeys[path.basename(f, '.pem')] = fs.readFileSync(path.join(cfg.JWS_VERIFICATION_KEYS_DIRECTORY, f));
        });

    // continuously monitor folder for changes in files.
    fsWatcher = fs.watch(cfg.JWS_VERIFICATION_KEYS_DIRECTORY, (eventType, filename) => {
        // On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory.
        // From: https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener
        if (eventType === FS_EVENT_TYPES.RENAME) {
            if (config.jwsVerificationKeys[path.basename(filename, '.pem')] == null) {
                config.jwsVerificationKeys[path.basename(filename, '.pem')] = fs.readFileSync(path.join(cfg.JWS_VERIFICATION_KEYS_DIRECTORY, filename));
            } else {
                delete config.jwsVerificationKeys[path.basename(filename, '.pem')];
            }
        }
    });

    config.cacheConfig.host = cfg.CACHE_HOST;
    config.cacheConfig.port = cfg.CACHE_PORT;

    config.enableTestFeatures = cfg.ENABLE_TEST_FEATURES.toLowerCase() === 'true' ? true : false;

    config.wso2Auth.staticToken = cfg.WS02_BEARER_TOKEN;
    config.wso2Auth.tokenEndpoint = cfg.OAUTH_TOKEN_ENDPOINT;
    config.wso2Auth.clientKey = cfg.OAUTH_CLIENT_KEY;
    config.wso2Auth.clientSecret = cfg.OAUTH_CLIENT_SECRET;
    config.wso2Auth.refreshSeconds = cfg.OAUTH_REFRESH_SECONDS;
};

const getConfig = () => {
    return config;
};

// useful for closing the open handler of the fs.watch, especially in unit tests.
const destroy = () => {
    fsWatcher && fsWatcher.close();

    config = null;
};

module.exports = {
    init,
    getConfig,
    setConfig,
    destroy
};
