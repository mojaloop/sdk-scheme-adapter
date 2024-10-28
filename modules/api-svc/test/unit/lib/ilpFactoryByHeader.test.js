jest.deepUnmock('@mojaloop/sdk-standard-components');

const { Ilp: { ILP_VERSIONS }, Logger } = require('@mojaloop/sdk-standard-components');
const { ISO_20022_HEADER_PART } = require('../../../src/constants');
const ilpFactory = require('../../../src/lib/ilpFactoryByHeader');

describe('ilpFactoryByHeader Tests -->', () => {
    const ilpOptions = {
        secret: 'test',
        logger: new Logger.Logger()
    };

    test('should create ILP v1 if a header has version=1.0', () => {
        const ilp = ilpFactory('application/vnd.interoperability.quotes+json;version=1.0', ilpOptions);
        expect(ilp.version).toBe(ILP_VERSIONS.v1);
    });

    test('should create ILP v1 in no version in a header', () => {
        const ilp = ilpFactory('application/vnd.interoperability', ilpOptions);
        expect(ilp.version).toBe(ILP_VERSIONS.v1);
    });

    test('should create ILP v4 for iso20022 header', () => {
        const ilp = ilpFactory(`application/vnd.interoperability.${ISO_20022_HEADER_PART}.quotes+json;`, ilpOptions);
        expect(ilp.version).toBe(ILP_VERSIONS.v4);
    });

    test('should create ILP v4 for a header with a version, not matching v1', () => {
        const ilp = ilpFactory('application/vnd.interoperability;version=3.0', ilpOptions);
        expect(ilp.version).toBe(ILP_VERSIONS.v4);
    });
});
