
const { transformHeadersIsoToFspiop } = require('~/lib/utils');

describe('utils', () => {
    describe('transformHeadersIsoToFspiop', () => {
        it('should transform headers', () => {
            const isoHeaders = {
                'content-type': 'application/vnd.interoperability.iso20022.transfers+json;version=2',
                'accept': 'application/vnd.interoperability.iso20022.transfers+json;version=2.0',
                'date': '2021-08-23T15:00:00.000Z'
            };
            const fspiopHeaders = {
                'content-type': 'application/vnd.interoperability.transfers+json;version=2',
                'accept': 'application/vnd.interoperability.transfers+json;version=2.0',
                'date': '2021-08-23T15:00:00.000Z'
            };
            expect(transformHeadersIsoToFspiop(isoHeaders)).toEqual(fspiopHeaders);
        });
    });
});
