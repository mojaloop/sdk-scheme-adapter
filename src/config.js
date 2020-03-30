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
require('dotenv').config();
const { from } = require('env-var');

console.log(process.env);

function getFileContent(path) {
    try {
        if (!fs.existsSync(path)) {
            throw new Error('File doesn\'t exist');
        }
        return fs.readFileSync(path);
    }catch (e) {
        console.log(e);
    }
}

const env = from(process.env, {
    asFileContent: (path) => getFileContent(path),
    asFileListContent: (pathList) => pathList.split(',').map((path) => getFileContent(path)),
});

module.exports = {
    inboundPort: env.get('INBOUND_LISTEN_PORT').default('4000').asPortNumber(),
    outboundPort: env.get('OUTBOUND_LISTEN_PORT').default('4001').asPortNumber(),
    tls: {
        inbound: {
            mutualTLS: {
                enabled: env.get('INBOUND_MUTUAL_TLS_ENABLED').default('false').asBool(),
            },
            creds: {
                ca: env.get('IN_CA_CERT_PATH').asFileListContent(),
                cert: env.get('IN_SERVER_CERT_PATH').asFileContent(),
                key: env.get('IN_SERVER_KEY_PATH').asFileContent(),
            },
        },
        outbound: {
            mutualTLS: {
                enabled: env.get('OUTBOUND_MUTUAL_TLS_ENABLED').default('false').asBool(),
            },
            creds: {
                ca: env.get('OUT_CA_CERT_PATH').asFileListContent(),
                cert: env.get('OUT_CLIENT_CERT_PATH').asFileContent(),
                key: env.get('OUT_CLIENT_KEY_PATH').asFileContent(),
            },
        },
    },
    peerEndpoint: env.get('PEER_ENDPOINT').required().asString(),
    alsEndpoint: env.get('ALS_ENDPOINT_HOST').asString(),
    quotesEndpoint: env.get('QUOTES_ENDPOINT').asString(),
    transfersEndpoint: env.get('TRANSFERS_ENDPOINT').asString(),
    backendEndpoint: env.get('BACKEND_ENDPOINT').required().asString(),

    dfspId: env.get('DFSP_ID').default('mojaloop').asString(),
    ilpSecret: env.get('ILP_SECRET').default('mojaloop-sdk').asString(),
    checkIlp: env.get('CHECK_ILP').default('true').asBool(),
    expirySeconds: env.get('EXPIRY_SECONDS').default('60').asIntPositive(),

    autoAcceptQuotes: env.get('AUTO_ACCEPT_QUOTES').default('true').asBool(),
    autoAcceptParty: env.get('AUTO_ACCEPT_PARTY').default('true').asBool(),

    useQuoteSourceFSPAsTransferPayeeFSP: env.get('USE_QUOTE_SOURCE_FSP_AS_TRANSFER_PAYEE_FSP').default('false').asBool(),

    // Getting secrets from files instead of environment variables reduces the likelihood of
    // accidental leakage.

    validateInboundJws: env.get('VALIDATE_INBOUND_JWS').default('true').asBool(),
    validateInboundPutPartiesJws: env.get('VALIDATE_INBOUND_PUT_PARTIES_JWS').default('false').asBool(),
    jwsSign: env.get('JWS_SIGN').default('true').asBool(),
    jwsSignPutParties: env.get('JWS_SIGN_PUT_PARTIES').default('false').asBool(),
    jwsSigningKey: env.get('JWS_SIGNING_KEY_PATH').asFileContent(),
    jwsVerificationKeysDirectory: env.get('JWS_VERIFICATION_KEYS_DIRECTORY').asString(),
    cacheConfig: {
        host: env.get('CACHE_HOST').required().asString(),
        port: env.get('CACHE_PORT').required().asPortNumber(),
    },
    enableTestFeatures: env.get('ENABLE_TEST_FEATURES').default('false').asBool(),
    oauthTestServer: {
        enabled: env.get('ENABLE_OAUTH_TOKEN_ENDPOINT').default('false').asBool(),
        clientKey: env.get('OAUTH_TOKEN_ENDPOINT_CLIENT_KEY').asString(),
        clientSecret: env.get('OAUTH_TOKEN_ENDPOINT_CLIENT_SECRET').asString(),
        listenPort: env.get('OAUTH_TOKEN_ENDPOINT_LISTEN_PORT').asPortNumber(),
    },
    wso2Auth: {
        staticToken: env.get('WSO2_BEARER_TOKEN').asString(),
        tokenEndpoint: env.get('OAUTH_TOKEN_ENDPOINT').asString(),
        clientKey: env.get('OAUTH_CLIENT_KEY').asString(),
        clientSecret: env.get('OAUTH_CLIENT_SECRET').asString(),
        refreshSeconds: env.get('OAUTH_REFRESH_SECONDS').default('60').asIntPositive(),
    },
    rejectExpiredQuoteResponses: env.get('REJECT_EXPIRED_QUOTE_RESPONSES').default('false').asBool(),
    rejectTransfersOnExpiredQuotes: env.get('REJECT_TRANSFERS_ON_EXPIRED_QUOTES').default('false').asBool(),
    rejectExpiredTransferFulfils: env.get('REJECT_EXPIRED_TRANSFER_FULFILS').default('false').asBool(),

    requestProcessingTimeoutSeconds: env.get('REQUEST_PROCESSING_TIMEOUT_SECONDS').default('30').asIntPositive(),

    logIndent: env.get('LOG_INDENT').default('2').asIntPositive(),

    allowTransferWithoutQuote: env.get('allowTransferWithoutQuote').default('false').asBool(),
};
