const { ISO_20022_HEADER_PART} = require('../src/constants');

const createInteropHeader = (resource, version = '1.1', isIso = false) => {
    const isoPart = isIso ? `.${ISO_20022_HEADER_PART}` : '';
    return `application/vnd.interoperability${isoPart}.${resource}+json;version=${version}`;
};

const createIsoHeader = (resource, version = '2.0') => createInteropHeader(resource, version, true);
const createFspiopHeader = (resource, version = '2.0') => createInteropHeader(resource, version, false);

module.exports = {
    createIsoHeader,
    createFspiopHeader,
};
