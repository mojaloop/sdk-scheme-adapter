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
const yaml = require('js-yaml');

function getFileContent (path) {
    if (!fs.existsSync(path)) {
        throw new Error('File doesn\'t exist');
    }
    return fs.readFileSync(path);
}

/**
     * Gets Resources versions from enviromental variable RESOURCES_VERSIONS
     * should be string in format: "resouceOneName=1.0,resourceTwoName=1.1"
     */
function getVersionFromConfig (resourceString) {
    const resourceVersionMap = {};
    resourceString
        .split(',')
        .forEach(e => e.split('=')
            .reduce((p, c) => {
                resourceVersionMap[p] = {
                    contentVersion: c,
                    acceptVersion: c.split('.')[0],
                };
            }));
    return resourceVersionMap;
}

function parseResourceVersions (resourceString) {
    if (!resourceString) return {};
    const resourceFormatRegex = /(([A-Za-z])\w*)=([0-9]+).([0-9]+)([^;:|],*)/g;
    const noSpResources = resourceString.replace(/\s/g,'');
    if (!resourceFormatRegex.test(noSpResources)) {
        throw new Error('Resource versions format should be in format: "resouceOneName=1.0,resourceTwoName=1.1"');
    }
    return getVersionFromConfig(noSpResources);
}

const env = from(process.env, {
    asFileContent: (path) => getFileContent(path),
    asFileListContent: (pathList) => pathList.split(',').map((path) => getFileContent(path)),
    asYamlConfig: (path) => yaml.load(getFileContent(path)),
    asResourceVersions: (resourceString) => parseResourceVersions(resourceString),
});

module.exports = {
    __parseResourceVersion: parseResourceVersions,
    mutualTLS: {
        inboundRequests: {
            enabled: env.get('INBOUND_MUTUAL_TLS_ENABLED').default('false').asBool(),
            creds: {
                ca: env.get('IN_CA_CERT_PATH').asFileListContent(),
                cert: env.get('IN_SERVER_CERT_PATH').asFileContent(),
                key: env.get('IN_SERVER_KEY_PATH').asFileContent(),
            },
        },
        outboundRequests: {
            enabled: env.get('OUTBOUND_MUTUAL_TLS_ENABLED').default('false').asBool(),
            creds: {
                ca: env.get('OUT_CA_CERT_PATH').asFileListContent(),
                cert: env.get('OUT_CLIENT_CERT_PATH').asFileContent(),
                key: env.get('OUT_CLIENT_KEY_PATH').asFileContent(),
            },
        },
    },
    inboundServerPort: env.get('INBOUND_LISTEN_PORT').default('4000').asPortNumber(),
    outboundServerPort: env.get('OUTBOUND_LISTEN_PORT').default('4001').asPortNumber(),
    testServerPort: env.get('TEST_LISTEN_PORT').default('4002').asPortNumber(),
    peerEndpoint: env.get('PEER_ENDPOINT').required().asString(),
    alsEndpoint: env.get('ALS_ENDPOINT').asString(),
    quotesEndpoint: env.get('QUOTES_ENDPOINT').asString(),
    bulkQuotesEndpoint: env.get('BULK_QUOTES_ENDPOINT').asString(),
    transactionRequestsEndpoint: env.get('TRANSACTION_REQUESTS_ENDPOINT').asString(),
    transfersEndpoint: env.get('TRANSFERS_ENDPOINT').asString(),
    bulkTransfersEndpoint: env.get('BULK_TRANSFERS_ENDPOINT').asString(),
    backendEndpoint: env.get('BACKEND_ENDPOINT').required().asString(),

    dfspId: env.get('DFSP_ID').default('mojaloop').asString(),
    ilpSecret: env.get('ILP_SECRET').default('mojaloop-sdk').asString(),
    checkIlp: env.get('CHECK_ILP').default('true').asBool(),
    expirySeconds: env.get('EXPIRY_SECONDS').default('60').asIntPositive(),

    autoAcceptQuotes: env.get('AUTO_ACCEPT_QUOTES').default('true').asBool(),
    autoAcceptParty: env.get('AUTO_ACCEPT_PARTY').default('true').asBool(),
    autoAcceptR2PBusinessQuotes: env.get('AUTO_ACCEPT_R2P_BUSINESS_QUOTES').default('false').asBool(),
    autoAcceptR2PDeviceQuotes: env.get('AUTO_ACCEPT_R2P_DEVICE_QUOTES').default('true').asBool(),
    autoAcceptR2PDeviceOTP: env.get('AUTO_ACCEPT_R2P_DEVICE_OTP').default('false').asBool(),
    autoAcceptParticipantsPut: env.get('AUTO_ACCEPT_PARTICIPANTS_PUT').default('false').asBool(),

    /* TODO:  high-risk transactions can require additional clearing check */
    // enableClearingCheck: env.get('ENABLE_CLEARING_CHECK').default('false').asBool(),

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
    wso2: {
        auth: {
            staticToken: env.get('WSO2_BEARER_TOKEN').asString(),
            tokenEndpoint: env.get('OAUTH_TOKEN_ENDPOINT').asString(),
            clientKey: env.get('OAUTH_CLIENT_KEY').asString(),
            clientSecret: env.get('OAUTH_CLIENT_SECRET').asString(),
            refreshSeconds: env.get('OAUTH_REFRESH_SECONDS').default('60').asIntPositive(),
        },
        requestAuthFailureRetryTimes: env.get('WSO2_AUTH_FAILURE_REQUEST_RETRIES').default('0').asIntPositive(),
    },
    rejectExpiredQuoteResponses: env.get('REJECT_EXPIRED_QUOTE_RESPONSES').default('false').asBool(),
    rejectTransfersOnExpiredQuotes: env.get('REJECT_TRANSFERS_ON_EXPIRED_QUOTES').default('false').asBool(),
    rejectExpiredTransferFulfils: env.get('REJECT_EXPIRED_TRANSFER_FULFILS').default('false').asBool(),

    requestProcessingTimeoutSeconds: env.get('REQUEST_PROCESSING_TIMEOUT_SECONDS').default('30').asIntPositive(),

    logIndent: env.get('LOG_INDENT').default('2').asIntPositive(),

    allowTransferWithoutQuote: env.get('ALLOW_TRANSFER_WITHOUT_QUOTE').default('false').asBool(),

    // for outbound transfers, allows an extensionList item in an error respone to be used instead
    // of the primary error code when setting the statusCode property on the synchronous response
    // to the DFSP backend. This is useful if an intermediary such as FXP returns underlying error
    // codes in error extensionLists.
    outboundErrorStatusCodeExtensionKey: env.get('OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY').asString(),

    proxyConfig: env.get('PROXY_CONFIG_PATH').asYamlConfig(),
    reserveNotification: env.get('RESERVE_NOTIFICATION').default('false').asBool(),
    // resourceVersions config should be string in format: "resouceOneName=1.0,resourceTwoName=1.1"
    resourceVersions: env.get('RESOURCE_VERSIONS').default('').asResourceVersions(),

    // in 3PPI DFSP generate their own `transferId` which is associated with
    // a transactionRequestId. this option decodes the ilp packet for
    // the `transactionId` to retrieve the quote from cache
    allowTransferIdTransactionIdMismatch: env.get('ALLOW_TRANSFER_TRANSACTION_ID_MISMATCH').default('false').asBool(),
};
