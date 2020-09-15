const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const supertest = require('supertest');
const Validate = require('@internal/validate');
const { addCustomKeys } = require('@internal/openapi');

const InboundServer = require('../../../InboundServer');
const OutboundServer = require('../../../OutboundServer');

/**
 * Get OpenAPI spec and Validator for specified server
 * @param serverType String
 * @return {Promise<{apiSpecs: Object, validator: Validator}>}
 */
const readApiInfo = async (serverType, useCustomKeywords = false) => {
    const specPath = path.join(__dirname, `../../../${serverType}/api.yaml`);
    const apiSpecs = yaml.load(fs.readFileSync(specPath));
    const validator = new Validate();
    if (useCustomKeywords) {
        await validator.initialise(addCustomKeys(apiSpecs));
    } else {
        await validator.initialise(apiSpecs);
    }
    
    return {apiSpecs, validator};
};

const createValidators = async () => {
    const apiInfoOutbound = await readApiInfo('OutboundServer');
    const apiSpecsOutbound = apiInfoOutbound.apiSpecs;
    const requestValidatorOutbound = apiInfoOutbound.validator;

    const apiInfoInbound = await readApiInfo('InboundServer', true);
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
    const defConfig = JSON.parse(JSON.stringify(config));
    defConfig.requestProcessingTimeoutSeconds = 2;
    const serverOutbound = new OutboundServer(defConfig);
    const reqOutbound = supertest(await serverOutbound.setupApi());
    await serverOutbound.start();

    const serverInbound = new InboundServer(defConfig);
    const reqInbound = supertest(await serverInbound.setupApi());
    await serverInbound.start();

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
