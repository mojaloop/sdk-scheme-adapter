const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const supertest = require('supertest');
const Validate = require('@internal/validate');

const InboundServer = require('../../../InboundServer');
const OutboundServer = require('../../../OutboundServer');
const { Logger } = require('@mojaloop/sdk-standard-components');
const Cache = require('@internal/cache');

/**
 * Get OpenAPI spec and Validator for specified server
 * @param serverType String
 * @return {Promise<{apiSpecs: Object, validator: Validator}>}
 */
const readApiInfo = async (serverType) => {
    const specPath = path.join(__dirname, `../../../${serverType}/api.yaml`);
    const apiSpecs = yaml.load(fs.readFileSync(specPath));
    const validator = new Validate();
    await validator.initialise(apiSpecs);
    return {apiSpecs, validator};
};

const createValidators = async () => {
    const apiInfoOutbound = await readApiInfo('OutboundServer');
    const apiSpecsOutbound = apiInfoOutbound.apiSpecs;
    const requestValidatorOutbound = apiInfoOutbound.validator;

    const apiInfoInbound = await readApiInfo('InboundServer');
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
    const logger = new Logger.Logger();
    const defConfig = JSON.parse(JSON.stringify(config));
    const cache = new Cache({
        ...defConfig.cacheConfig,
        logger: logger.push({ component: 'cache' })
    });
    defConfig.requestProcessingTimeoutSeconds = 2;
    const serverOutbound = new OutboundServer(defConfig, logger, cache);
    await serverOutbound.start();
    const reqOutbound = supertest(serverOutbound._server);

    const serverInbound = new InboundServer(defConfig, logger, cache);
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
};
