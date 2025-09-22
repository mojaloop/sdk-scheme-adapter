const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const yaml = require('js-yaml');
const supertest = require('supertest');
const { WSO2Auth } = require('@mojaloop/sdk-standard-components');

const { logger } = require('~/lib/logger');
const { MetricsClient } = require('~/lib/metrics');
const Validate = require('~/lib/validate');
const InboundServer = require('~/InboundServer');
const OutboundServer = require('~/OutboundServer');
const Cache = require('~/lib/cache');

const ServerType = {
    Inbound: 'Inbound',
    Outbound: 'Outbound',
};

/**
 * Create mock shared agents for testing
 */
function createMockSharedAgents() {
    const httpAgent = new http.Agent({ keepAlive: true });
    const httpsAgent = new https.Agent({ keepAlive: true });

    // Prevent logging of agent internals in tests
    httpAgent.toJSON = () => ({ type: 'MockHttpAgent', keepAlive: true });
    httpsAgent.toJSON = () => ({ type: 'MockHttpsAgent', keepAlive: true });

    return { httpAgent, httpsAgent };
}

/**
 * Get OpenAPI spec and Validator for specified server
 * @param {ServerType} serverType
 * @return {Promise<{apiSpecs: Object, validator: Validator}>}
 */
const readApiInfo = async (serverType) => {
    let specPath;
    if (serverType === ServerType.Outbound) {
        specPath = path.join(path.dirname(require.resolve('@mojaloop/api-snippets')), '../docs/sdk-scheme-adapter-outbound-v2_1_0-openapi3-snippets.yaml');
    } else if (serverType === ServerType.Inbound) {
        specPath = path.join(__dirname, '../../../src/InboundServer/api.yaml');
    }
    const apiSpecs = yaml.load(fs.readFileSync(specPath));
    const validator = new Validate();
    await validator.initialise(apiSpecs);
    return {apiSpecs, validator};
};

const createValidators = async () => {
    const apiInfoOutbound = await readApiInfo(ServerType.Outbound);
    const apiSpecsOutbound = apiInfoOutbound.apiSpecs;
    const requestValidatorOutbound = apiInfoOutbound.validator;

    const apiInfoInbound = await readApiInfo(ServerType.Inbound);
    const apiSpecsInbound = apiInfoInbound.apiSpecs;
    const requestValidatorInbound = apiInfoInbound.validator;
    return {
        apiSpecsOutbound,
        requestValidatorOutbound,
        apiSpecsInbound,
        requestValidatorInbound,
    };
};

const createTestServers = async (config) => {
    const defConfig = structuredClone(config);
    const cache = new Cache({
        cacheUrl: defConfig.cacheUrl,
        logger: logger.push({ component: 'cache' }),
        unsubscribeTimeoutMs: defConfig.unsubscribeTimeoutMs,
    });
    await cache.connect();
    defConfig.requestProcessingTimeoutSeconds = 2;
    const metricsClient = new MetricsClient();
    metricsClient._prometheusRegister.clear();
    const wso2 = {
        auth: new WSO2Auth({
            ...defConfig.wso2.auth,
            logger,
            tlsCreds: defConfig.outbound.tls.mutualTLS.enabled && defConfig.outbound.tls.creds,
        }),
        retryWso2AuthFailureTimes: defConfig.wso2.requestAuthFailureRetryTimes,
    };
    const mockSharedAgents = createMockSharedAgents();

    const serverOutbound = new OutboundServer(defConfig, logger, cache, metricsClient, wso2, mockSharedAgents);
    await serverOutbound.start();
    const reqOutbound = supertest(serverOutbound._server);

    const serverInbound = new InboundServer(defConfig, logger, cache, wso2, mockSharedAgents);
    await serverInbound.start();
    const reqInbound = supertest(serverInbound._server);

    return {
        serverOutbound,
        reqOutbound,
        serverInbound,
        reqInbound,
    };
};

const destroyTestServers = async (serversInfo) => {
    await serversInfo.serverOutbound.stop();
    await serversInfo.serverInbound.stop();
};

module.exports = {
    createValidators,
    createTestServers,
    destroyTestServers,
    createMockSharedAgents,
};
