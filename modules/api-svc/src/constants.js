const { defaultProtocolResources } = require('@mojaloop/central-services-shared').Util.Hapi.FSPIOPHeaderValidation;

const defaultVersion = '2.0';
const RESOURCE_VERSIONS_STRING = defaultProtocolResources
    .map(r => `${r}=${defaultVersion}`)
    .join(',');

const ISO_20022_HEADER_PART = 'iso20022';

const API_TYPES = Object.freeze({
    fspiop: 'fspiop',
    iso20022: 'iso20022',
});

const SDK_LOGGER_HIERARCHY = ['verbose', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'];

module.exports = {
    API_TYPES,
    ISO_20022_HEADER_PART,
    RESOURCE_VERSIONS_STRING,
    SDK_LOGGER_HIERARCHY,
};
