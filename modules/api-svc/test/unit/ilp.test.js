const { Ilp, Logger } = jest.requireActual('@mojaloop/sdk-standard-components');
const mocks = require('./lib/model/data/mocks');

describe('ILP Tests -->', () => {
    let ilp;
    let fxQuotesPayload;
    let fxpBeResponse;

    beforeEach(() => {
        ilp = Ilp.ilpFactory(Ilp.ILP_VERSIONS.v4, {
            secret: 'test',
            logger: new Logger.Logger(),
        });
        fxQuotesPayload = mocks.mockFxQuotesPayload();
        fxpBeResponse = mocks.mockFxQuotesInternalResponse();
    });

    test('should generate ILP response based on fxQuotes request/response', () => {
        const {
            ilpPacket,
            fulfilment,
            condition
        } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);

        expect(ilpPacket).toBeTruthy();
        expect(fulfilment).toBeTruthy();
        expect(condition).toBeTruthy();
    });

    test('should generate proper ILP packet for fxQuote', () => {
        const { ilpPacket } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);

        const decodedIlp = ilp.decodeIlpPacket(ilpPacket);
        expect(decodedIlp).toBeTruthy();
        expect(typeof decodedIlp.amount).toBe('string');
        expect(typeof decodedIlp.destination).toBe('string');
        expect(decodedIlp.data).toBeInstanceOf(Buffer);
        expect(decodedIlp.expiresAt).toBeInstanceOf(Date);
        expect(decodedIlp.executionCondition).toBeInstanceOf(Buffer);

        const decodedJson = JSON.parse(Buffer.from(decodedIlp.data.toString(), 'base64').toString());
        const { conversionRequestId } = fxQuotesPayload;
        const { conversionTerms } = fxpBeResponse;
        const transactionObject = {
            conversionRequestId,
            conversionTerms
        };
        expect(decodedJson).toEqual(transactionObject);
    });

    test('should generate ILP packet with proper condition', () => {
        const { ilpPacket, condition } = ilp.getFxQuoteResponseIlp(fxQuotesPayload, fxpBeResponse);
        const { executionCondition } = ilp.decodeIlpPacket(ilpPacket);
        expect(executionCondition).toBeInstanceOf(Buffer);
        expect(condition).toBe(executionCondition.toString('base64url'));
    });
});

