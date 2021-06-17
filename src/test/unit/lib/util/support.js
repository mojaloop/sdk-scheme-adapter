'use strict';

const Chance = require('chance');
const { anyVersion } = require('../../../../../src/lib/util/headerValidation').protocolVersions;
const chance = new Chance();

const validAcceptHeaders = resource => [
    `application/vnd.interoperability.${resource}+json`,
    `application/vnd.interoperability.${resource}+json,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1.0`,
    `application/vnd.interoperability.${resource}+json; version=1.0`,
    `application/vnd.interoperability.${resource}+json ;version=1.0`,
    `application/vnd.interoperability.${resource}+json ; version=1.0`,
    `application/vnd.interoperability.${resource}+json;version=1.0,application/vnd.interoperability.${resource}+json;version=1.1`,
    `application/vnd.interoperability.${resource}+json;version=1.1`,
    `application/vnd.interoperability.${resource}+json;version=2.0`,
    `application/vnd.interoperability.${resource}+json;version=2.1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=2.1`,
    `application/vnd.interoperability.${resource}+json;version=12`,
    `application/vnd.interoperability.${resource}+json;version=12.0`,
    `application/vnd.interoperability.${resource}+json;version=12.10`,
    `application/vnd.interoperability.${resource}+json;version=2.100`,
    `application/vnd.interoperability.${resource}+json;version=100.100`,
    `application/vnd.interoperability.${resource}+json;version=001.20`,
    `application/vnd.interoperability.${resource}+json;version=12.12,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json,application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json`
];

const invalidAcceptHeaders = resource => [
    'whatever',
    'application/vnd.interoperability.whatever+json;version=1, ',
    'application/vnd.interoperability.whatever+json;  version=1, ',
    `application/vnd.interoperability.a${resource}+json;version=1, `,
    `application/vnd.interoperability.${resource}+json;version=1, `,
    `application/vnd.interoperability.${resource}+json;  version=1`,
    `application/vnd.interoperability.${resource}+json  ;  version=1`,
    `application/vnd.interoperability.${resource}+json;version=1, application/vnd.interoperability.${resource}+json;version=1`,
    ...validAcceptHeaders(resource).map(h => h.toUpperCase())
];

const validContentTypeHeaders = resource => [
    `application/vnd.interoperability.${resource}+json;version=1.0`,
    `application/vnd.interoperability.${resource}+json; version=1.0`,
    `application/vnd.interoperability.${resource}+json ;version=1.0`,
    `application/vnd.interoperability.${resource}+json ; version=1.0`,
    `application/vnd.interoperability.${resource}+json;version=1.1`,
    `application/vnd.interoperability.${resource}+json;version=2.0`,
    `application/vnd.interoperability.${resource}+json;version=2.1`,
    `application/vnd.interoperability.${resource}+json;version=12.0`,
    `application/vnd.interoperability.${resource}+json;version=12.10`,
    `application/vnd.interoperability.${resource}+json;version=2.100`,
    `application/vnd.interoperability.${resource}+json;version=100.100`,
    `application/vnd.interoperability.${resource}+json;version=001.20`
];

const invalidContentTypeHeaders = resource => [
    `application/vnd.interoperability.${resource}+json`,
    `application/vnd.interoperability.${resource}+json,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;  version=1.0`,
    `application/vnd.interoperability.${resource}+json  ;version=1.0`,
    `application/vnd.interoperability.${resource}+json  ;  version=1.0`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1.0,application/vnd.interoperability.${resource}+json;version=1.1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=2.1`,
    `application/vnd.interoperability.${resource}+json;version=12`,
    `application/vnd.interoperability.${resource}+json;version=12.12,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json,application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1`,
    `application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json;version=1.112,application/vnd.interoperability.${resource}+json;version=1,application/vnd.interoperability.${resource}+json`
];

const verToVerStr = (ver) => {
    return ver === anyVersion ? '' : `;version=${ver}`;
};

// Generate a version between 0 and 999.999, or 'any' version (no version). For the reader's
// understanding: versions should match the following regex: /^\d{1,3}(.\d{1,3})?$/
const randomVersion = (chanceOfAny = 0.2) => {
    return Math.random() < chanceOfAny ? anyVersion : (chance.floating({ min: 0, max: 110, fixed: chance.integer({ min: 0, max: 3 }) }));
};

const generateAcceptVersions = (count = Math.round(1 + Math.random() ** 4 * 10)) => {
    return Array.from({ length: count }, () => randomVersion());
};

// Generate a valid accept header, given the resource and versions of interest
const generateAcceptHeader = (resource, versions) => {
    return versions.map(v => `application/vnd.interoperability.${resource}+json${verToVerStr(v)}`).join(',');
};

const generateContentTypeVersion = () => {
    return chance.floating({ min: 0, max: 110, fixed: chance.integer({ min: 1, max: 3 }) });
};

// Generate a valid content type header, given the resource and version of interest
const generateContentTypeHeader = (resource, version) => {
    return `application/vnd.interoperability.${resource}+json;version=${version % 1 === 0 ? version.toFixed(1) : version}`;
};

module.exports = {
    generateAcceptHeader,
    generateAcceptVersions,
    generateContentTypeHeader,
    generateContentTypeVersion,
    validAcceptHeaders,
    invalidAcceptHeaders,
    validContentTypeHeaders,
    invalidContentTypeHeaders
};
