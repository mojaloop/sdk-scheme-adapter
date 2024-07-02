const { Ilp } = jest.requireActual('@mojaloop/sdk-standard-components');
const mocks = require('./lib/model/data/mocks');

describe('ILP Tests -->', () => {
    let ilp;

    beforeEach(() => {
        ilp = new Ilp({
            secret: 'test',
            logger: { log: jest.fn() }
        });
    });

    test('should generate ILP components for a fxQuote request', () => {
        const fxQuotesPayload = mocks.mockFxQuotesPayload();
        const fxpBeResponse = mocks.mockFxQuotesInternalResponse();

        const {
            ilpPacket,
            fulfilment,
            condition
        } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);

        expect(ilpPacket).toBeTruthy();
        expect(fulfilment).toBeTruthy();
        expect(condition).toBeTruthy();

        const decodedIlp = ilp.decodeIlpPacket(ilpPacket);
        expect(decodedIlp).toBeTruthy();
        expect(typeof decodedIlp.amount).toBe('string');
        expect(typeof decodedIlp.account).toBe('string');
        expect(decodedIlp.data).toBeInstanceOf(Buffer);

        const decodedJson = JSON.parse(Buffer.from(decodedIlp.data.toString(), 'base64').toString());
        const { conversionRequestId } = fxQuotesPayload;
        const { conversionTerms } = fxpBeResponse;
        const transactionObject = {
            conversionRequestId,
            conversionTerms
        };
        expect(decodedJson).toEqual(transactionObject);
    });
});

