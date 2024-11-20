const AxiosMockAdapter = require('axios-mock-adapter');
const { axios } = require('@mojaloop/sdk-standard-components');
const { ISO_20022_HEADER_PART} = require('../src/constants');

const mockAxios = new AxiosMockAdapter(axios);

const jsonContentTypeHeader = Object.freeze({ 'content-type': 'application/json' });

const createInteropHeader = (resource, version = '1.1', isIso = false) => {
    const isoPart = isIso ? `.${ISO_20022_HEADER_PART}` : '';
    return `application/vnd.interoperability${isoPart}.${resource}+json;version=${version}`;
};

const createIsoHeader = (resource, version = '2.0') => createInteropHeader(resource, version, true);
const createFspiopHeader = (resource, version = '2.0') => createInteropHeader(resource, version, false);

module.exports = {
    mockAxios, // IMPORTANT:  mockAxios should be imported in tests BEFORE any httpRequester functions
    jsonContentTypeHeader,
    createIsoHeader,
    createFspiopHeader,
};
