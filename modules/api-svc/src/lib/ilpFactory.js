const { ilpFactory, ILP_VERSIONS } = require('@mojaloop/sdk-standard-components').Ilp;
const { ISO_20022_HEADER_PART } = require('../constants');

const API_VERSIONS_FOR_ILPv1 = ['1', '1.0', '1.1']; // make configurable?
const VERSION_REGEX = /version=([\d.]+)/;

const defineIlpVersion = (header = '') => {
    if (header.includes(ISO_20022_HEADER_PART)) return ILP_VERSIONS.v4;
    // todo: think, if we need to check version in this case?

    const matched = header.match(VERSION_REGEX);
    if (!matched) return ILP_VERSIONS.v1;
    // todo: maybe, throw error?

    return API_VERSIONS_FOR_ILPv1.includes(matched[1])
        ? ILP_VERSIONS.v1
        : ILP_VERSIONS.v4;
};


module.exports = (header, ilpOptions) => {
    if (!ilpOptions) throw new Error('No ilpOptions provided');

    const version = defineIlpVersion(header);

    return ilpFactory(version, ilpOptions);
};
