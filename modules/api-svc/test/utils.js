const { ISO_20022_HEADER_PART} = require('../src/constants');

const createIsoHeader = (resource, version = '2.0') =>
    `application/vnd.interoperability.${ISO_20022_HEADER_PART}.${resource}+json;version=${version}`;

module.exports = {
    createIsoHeader,
};
