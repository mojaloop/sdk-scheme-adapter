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
'use strict';

require('dotenv').config();
const fs = require('node:fs');
const yaml = require('js-yaml');
const { from } = require('env-var');
const { LOG_LEVELS } = require('./lib/logger');
const { API_TYPES, RESOURCE_VERSIONS_STRING } = require('./constants');

function getFileContent (path) {
    if (!fs.existsSync(path)) {
        throw new Error('File doesn\'t exist');
    }
    return fs.readFileSync(path);
}

/**
     * Gets Resources versions from environmental variable RESOURCES_VERSIONS
     * should be string in format: "resourceOneName=1.0,resourceTwoName=1.1"
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
        throw new Error('Resource versions format should be in format: "resourceOneName=1.0,resourceTwoName=1.1"');
    }
    return getVersionFromConfig(noSpResources);
}

const env = from(process.env, {
    asFileContent: (path) => getFileContent(path),
    asFileListContent: (pathList) => pathList.split(',').map((path) => getFileContent(path)),
    asYamlConfig: (path) => yaml.load(getFileContent(path)),
    asResourceVersions: (resourceString) => parseResourceVersions(resourceString),
});

// ISO-20022 config options
// apiType can be one of:
//   - fspiop
//   - iso20022
const apiType = env.get('API_TYPE').default(API_TYPES.fspiop).asString();
const isIsoApi = apiType === API_TYPES.iso20022;

module.exports = {
    __parseResourceVersion: parseResourceVersions,
    control: {
        mgmtAPIWsUrl: env.get('MGMT_API_WS_URL').default('127.0.0.1').asString(),
        mgmtAPIWsPort: env.get('MGMT_API_WS_PORT').default('4005').asPortNumber(),
        mgmtAPILatencyAssumption: env.get('MGMT_API_LATENCY_ASSUMPTION').default('2000').asIntPositive(),
        mgmtAPIPollIntervalMs: env.get('MANAGEMENT_API_POLL_INTERVAL_MS').asIntPositive(), // undefined if not set (feature disabled)
    },
    idGenerator: env.get('ID_GENERATOR').default('{"type":"ulid"}').asJsonObject(),
    logLevel: env.get('LOG_LEVEL').default('info').asEnum(LOG_LEVELS),
    inbound: {
        port: env.get('INBOUND_LISTEN_PORT').default('4000').asPortNumber(),
        tls: {
            mutualTLS: {
                enabled: env.get('INBOUND_MUTUAL_TLS_ENABLED').default('false').asBool(),
            },
            creds: {
                ca: env.get('IN_CA_CERT_PATH').asFileListContent(),
                cert: env.get('IN_SERVER_CERT_PATH').asFileContent(),
                key: env.get('IN_SERVER_KEY_PATH').asFileContent(),
            },
        },
    },
    outbound: {
        port: env.get('OUTBOUND_LISTEN_PORT').default('4001').asPortNumber(),
        tls: {
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
    backendEventHandler: {
        enabled: env.get('ENABLE_BACKEND_EVENT_HANDLER').default('true').asBool(),
        domainEventConsumer: {
            brokerList: env.get('BACKEND_EVENT_CONSUMER_BROKER_LIST').default('localhost:9092').asString(),
            groupId: env.get('BACKEND_EVENT_CONSUMER_GROUP_ID').default('domain_events_consumer_api_svc_backend_group').asString(),
            clientId: env.get('BACKEND_EVENT_CONSUMER_CLIENT_ID').default('backend_consumer_client_id').asString(),
            topics: env.get('BACKEND_EVENT_CONSUMER_TOPICS').default('topic-sdk-outbound-domain-events').asArray(),
        },
        domainEventProducer:{
            brokerList: env.get('BACKEND_EVENT_PRODUCER_BROKER_LIST').default('localhost:9092').asString(),
            clientId: env.get('BACKEND_EVENT_PRODUCER_CLIENT_ID').default('backend_producer_client_id').asString(),
            topic: env.get('BACKEND_EVENT_PRODUCER_TOPIC').default('topic-sdk-outbound-domain-events').asString(),
        },
    },
    fspiopEventHandler: {
        enabled: env.get('ENABLE_FSPIOP_EVENT_HANDLER').default('true').asBool(),
        domainEventConsumer: {
            brokerList: env.get('FSPIOP_EVENT_CONSUMER_BROKER_LIST').default('localhost:9092').asString(),
            groupId: env.get('FSPIOP_EVENT_CONSUMER_GROUP_ID').default('domain_events_consumer_api_svc_fspiop_group').asString(),
            clientId: env.get('FSPIOP_EVENT_CONSUMER_CLIENT_ID').default('fspiop_consumer_client_id').asString(),
            topics: env.get('FSPIOP_EVENT_CONSUMER_TOPICS').default('topic-sdk-outbound-domain-events').asArray(),
        },
        domainEventProducer:{
            brokerList: env.get('FSPIOP_EVENT_PRODUCER_BROKER_LIST').default('localhost:9092').asString(),
            clientId: env.get('FSPIOP_EVENT_PRODUCER_CLIENT_ID').default('fspiop_producer_client_id').asString(),
            topic: env.get('FSPIOP_EVENT_PRODUCER_TOPIC').default('topic-sdk-outbound-domain-events').asString(),
        },
    },
    test: {
        port: env.get('TEST_LISTEN_PORT').default('4002').asPortNumber(),
    },
    peerEndpoint: env.get('PEER_ENDPOINT').required().asString(),
    alsEndpoint: env.get('ALS_ENDPOINT').asString(),
    quotesEndpoint: env.get('QUOTES_ENDPOINT').asString(),
    bulkQuotesEndpoint: env.get('BULK_QUOTES_ENDPOINT').asString(),
    transactionRequestsEndpoint: env.get('TRANSACTION_REQUESTS_ENDPOINT').asString(),
    transfersEndpoint: env.get('TRANSFERS_ENDPOINT').asString(),
    bulkTransfersEndpoint: env.get('BULK_TRANSFERS_ENDPOINT').asString(),
    fxQuotesEndpoint: env.get('FX_QUOTES_ENDPOINT').asString(),
    fxTransfersEndpoint: env.get('FX_TRANSFERS_ENDPOINT').asString(),
    pingEndpoint: env.get('PING_ENDPOINT').asString(),
    backendEndpoint: env.get('BACKEND_ENDPOINT').required().asString(),

    getServicesFxpResponse: env.get('GET_SERVICES_FXP_RESPONSE').default('').asArray(),

    dfspId: env.get('DFSP_ID').default('mojaloop').asString(),
    multiDfsp: env.get('MULTI_DFSP').default('false').asBool(),
    ilpSecret: env.get('ILP_SECRET').default('mojaloop-sdk').asString(),
    checkIlp: env.get('CHECK_ILP').default('true').asBool(),
    expirySeconds: env.get('EXPIRY_SECONDS').default('60').asIntPositive(),

    multiplePartiesResponse: env.get('MULTIPLE_PARTIES_RESPONSE').default('false').asBool(),
    multiplePartiesResponseSeconds: env.get('MULTIPLE_PARTIES_RESPONSE_SECONDS').default('30').asIntPositive(),

    autoAcceptQuotes: env.get('AUTO_ACCEPT_QUOTES').default('true').asBool(),
    autoAcceptParty: env.get('AUTO_ACCEPT_PARTY').default('true').asBool(),
    autoAcceptR2PParty: env.get('AUTO_ACCEPT_R2P_PARTY').default('false').asBool(),
    autoAcceptR2PBusinessQuotes: env.get('AUTO_ACCEPT_R2P_BUSINESS_QUOTES').default('false').asBool(),
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
    cacheUrl: env.get('CACHE_URL').default('redis://localhost:6379').asUrlString(),
    unsubscribeTimeoutMs: env.get('UNSUBSCRIBE_TIMEOUT_MS').default('5000').asIntPositive(),
    enableTestFeatures: env.get('ENABLE_TEST_FEATURES').default('false').asBool(),
    oauthTestServer: {
        enabled: env.get('ENABLE_OAUTH_TOKEN_ENDPOINT').default('false').asBool(),
        clientKey: env.get('OAUTH_TOKEN_ENDPOINT_CLIENT_KEY').asString(),
        clientSecret: env.get('OAUTH_TOKEN_ENDPOINT_CLIENT_SECRET').asString(),
        listenPort: env.get('OAUTH_TOKEN_ENDPOINT_LISTEN_PORT').asPortNumber(),
    },
    oidc: {
        auth: {
            staticToken: env.get('OIDC_BEARER_TOKEN').asString() || env.get('WSO2_BEARER_TOKEN').asString(), // for backward compatibility
            tokenEndpoint: env.get('OAUTH_TOKEN_ENDPOINT').asString(), // Keycloak
            clientKey: env.get('OAUTH_CLIENT_KEY').asString(),
            clientSecret: env.get('OAUTH_CLIENT_SECRET').asString(),
            refreshSeconds: env.get('OAUTH_REFRESH_SECONDS').default('60').asIntPositive(),
            refreshRetrySeconds: env.get('OAUTH_REFRESH_RETRY_SECONDS').default('10').asIntPositive(),
        },
        mTlsEnabled: env.get('OAUTH_MUTUAL_TLS_ENABLED').default('false').asBool(),
        requestAuthFailureRetryTimes: env.get('OIDC_AUTH_FAILURE_REQUEST_RETRIES').default('0').asIntPositive(),
    },
    rejectExpiredQuoteResponses: env.get('REJECT_EXPIRED_QUOTE_RESPONSES').default('false').asBool(),
    rejectTransfersOnExpiredQuotes: env.get('REJECT_TRANSFERS_ON_EXPIRED_QUOTES').default('false').asBool(),
    rejectExpiredTransferFulfils: env.get('REJECT_EXPIRED_TRANSFER_FULFILS').default('false').asBool(),

    requestProcessingTimeoutSeconds: env.get('REQUEST_PROCESSING_TIMEOUT_SECONDS').default('30').asIntPositive(),

    logIndent: env.get('LOG_INDENT').default('2').asIntPositive(),
    isJsonOutput:  env.get('LOG_IS_JSON_OUTPUT').default('false').asBool(),

    allowTransferWithoutQuote: env.get('ALLOW_TRANSFER_WITHOUT_QUOTE').default('false').asBool(),

    // for outbound transfers, allows an extensionList item in an error respone to be used instead
    // of the primary error code when setting the statusCode property on the synchronous response
    // to the DFSP backend. This is useful if an intermediary such as FXP returns underlying error
    // codes in error extensionLists.
    outboundErrorStatusCodeExtensionKey: env.get('OUTBOUND_ERROR_STATUSCODE_EXTENSION_KEY').asString(),

    proxyConfig: env.get('PROXY_CONFIG_PATH').asYamlConfig(),
    reserveNotification: env.get('RESERVE_NOTIFICATION').default('false').asBool(),
    sendFinalNotificationIfRequested: env.get('SEND_FINAL_NOTIFICATION_IF_REQUESTED').default('false').asBool(),

    // resourceVersions config should be string in format: "resourceOneName=1.0,resourceTwoName=1.1"
    resourceVersions: env.get('RESOURCE_VERSIONS').default(RESOURCE_VERSIONS_STRING).asResourceVersions(),

    metrics: {
        port: env.get('METRICS_SERVER_LISTEN_PORT').default('4004').asPortNumber()
    },

    // in 3PPI DFSP's generate their own `transferId` which is associated with
    // a transactionRequestId. this option decodes the ilp packet for
    // the `transactionId` to retrieve the quote from cache
    allowDifferentTransferTransactionId: env.get('ALLOW_DIFFERENT_TRANSFER_TRANSACTION_ID').default('false').asBool(),

    pm4mlEnabled: env.get('PM4ML_ENABLED').default('false').asBool(),

    fspiopApiServerMaxRequestBytes: env.get('FSPIOP_API_SERVER_MAX_REQUEST_BYTES').default('209715200').asIntPositive(), // Default is 200mb
    backendApiServerMaxRequestBytes: env.get('BACKEND_API_SERVER_MAX_REQUEST_BYTES').default('209715200').asIntPositive(), // Default is 200mb,
    supportedCurrencies: env.get('SUPPORTED_CURRENCIES').default('').asArray(),

    apiType,
    isIsoApi,
    inboundOpenApiFilename: isIsoApi ? 'api_iso20022.yaml' : 'api.yaml',

    // ILP version options
    // ilpVersion can be one of:
    //    - 1
    //    - 4
    ilpVersion: env.get('ILP_VERSION').default('1').asString(),

    // Redis key ttl when stored in the cache, if value is used as zero it will
    // persist throughout the session , value used is in seconds
    redisCacheTtl: env.get('REDIS_CACHE_TTL').default('0').asInt(),

    backendRequestRetry: {
        enabled: env.get('BACKEND_REQUEST_RETRY_ENABLED').default('true').asBool(),
        maxRetries: env.get('BACKEND_REQUEST_RETRY_MAX_RETRIES').default('5').asIntPositive(),
        retryDelayMs: env.get('BACKEND_REQUEST_RETRY_DELAY_MS').default('1000').asIntPositive(),
        maxRetryDelayMs: env.get('BACKEND_REQUEST_RETRY_MAX_DELAY_MS').default('10000').asIntPositive(),
        backoffFactor: env.get('BACKEND_REQUEST_RETRY_BACKOFF_FACTOR').default('2').asIntPositive(),
    },
    getTransferRequestRetry: {
        enabled: env.get('GET_TRANSFER_REQUEST_RETRY_ENABLED').default('false').asBool(),
        maxRetries: env.get('GET_TRANSFER_REQUEST_RETRY_MAX_RETRIES').default('3').asIntPositive(),
        retryDelayMs: env.get('GET_TRANSFER_REQUEST_RETRY_DELAY_MS').default('1000').asIntPositive(),
        maxRetryDelayMs: env.get('GET_TRANSFER_REQUEST_RETRY_MAX_DELAY_MS').default('10000').asIntPositive(),
        backoffFactor: env.get('GET_TRANSFER_REQUEST_RETRY_BACKOFF_FACTOR').default('2').asIntPositive(),
    },
    patchNotificationGraceTimeMs: env.get('PATCH_NOTIFICATION_GRACE_TIME_MS').default('15000').asIntPositive(),

    // W3C Trace Context specification - trace flags for traceparent header
    // Must be a two-character lowercase hex string (00-ff)
    traceFlags: env.get('TRACE_FLAGS').default('01').asString(),
};
