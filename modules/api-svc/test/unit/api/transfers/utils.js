const { mockAxios, jsonContentTypeHeader } = require('../../../helpers');
const { logger } = require('../../../../src/lib/logger');
const postTransfersSimpleBody = require('./data/postTransfersSimpleBody');
const mergeAllOf = require('../utils').mergeAllOf;

const Ajv = require('ajv').default;
const ajv = new Ajv({ allErrors: true, strict: true });

function createGetTransfersTester({ reqInbound, reqOutbound, apiSpecsOutbound }) {
    return async (putBodyFn, responseCode, responseBody) => {
        const TRANSFER_ID = '00000000000000000000000001';

        const sendPutTransfers = async () => {
            const putBody = await Promise.resolve(putBodyFn());
            let putUrl = `/transfers/${TRANSFER_ID}`;
            if (putBody.errorInformation) {
                putUrl += '/error';
            }

            return reqInbound.put(putUrl)
                .send(putBody)
                .set('content-type', 'application/vnd.interoperability.transfers+json;version=1.1')
                .set('Date', new Date().toISOString())
                .set('fspiop-source', 'mojaloop-sdk')
                .expect(200);
        };

        mockAxios.reset();
        mockAxios.onGet(`/transfers/${TRANSFER_ID}`).reply(() => {
            sendPutTransfers().then();
            return [202, null, jsonContentTypeHeader];
        });

        const res = await reqOutbound.get(`/transfers/${TRANSFER_ID}`);
        const { body } = res;
        expect(res.statusCode).toEqual(responseCode);

        if (responseCode === 500) {
            delete body.transferState;
        }

        cleanTransferState(body);
        expect(body).toEqual(responseBody);

        const responseSchema = apiSpecsOutbound.paths['/transfers/{transferId}'].get.responses[responseCode].content['application/json'].schema;
        const flatSchema = mergeAllOf(responseSchema);        
        const validate = ajv.compile(flatSchema);

        const valid = validate(body);
        
        if (!valid) {
          console.error(validate.errors);
          throw new Error('Response validation failed');
        }
    };
}

function cleanTransferState(body) {
    delete body.initiatedTimestamp;
    const ts = body.transferState;
    if (ts) {
        delete ts.initiatedTimestamp;
        delete ts.traceId;
        delete ts.quoteRequestExtensions;
        delete ts.transferRequestExtensions;
        delete ts.direction;
        ['quoteResponse', 'getPartiesResponse', 'fulfil'].forEach(k => ts[k] && delete ts[k].headers);
        ['quoteRequest', 'getPartiesRequest', 'prepare'].forEach(k => delete ts[k]);
    }
    ['quoteResponse', 'getPartiesResponse', 'fulfil'].forEach(k => body[k] && delete body[k].headers);
    ['quoteRequest', 'getPartiesRequest', 'prepare'].forEach(k => delete body[k]);
    delete body.quoteResponse?.originalIso20022QuoteResponse;
    delete body.traceId;
    delete body.direction;
    delete body.quoteRequestExtensions;
    delete body.transferRequestExtensions;
}

function createPostTransfersTester({ requestValidatorInbound, reqInbound, reqOutbound, apiSpecsOutbound }) {
    return async (bodyFn, responseCode, responseBody) => {
        let pendingRequest = Promise.resolve();
        let currentRequest = Promise.resolve();

        const handleRequest = async (req) => {
            const urlPath = req.path;
            const body = req.body && JSON.parse(req.body);
            const headers = req.headers;
            const method = req.method;
            let putBody, putUrl, contentType;

            requestValidatorInbound.validateRequest({ method, path: urlPath, request: { headers, body } }, logger);

            if (urlPath.startsWith('/parties/')) {
                putBody = await Promise.resolve(bodyFn.parties.put());
                putUrl = urlPath;
                contentType = 'application/vnd.interoperability.parties+json;version=1.1';
            } else if (urlPath === '/quotes') {
                expect(body).toEqual(bodyFn.quotes.post(body));
                putBody = await Promise.resolve(bodyFn.quotes.put(body));
                putUrl = `/quotes/${body.quoteId}`;
                contentType = 'application/vnd.interoperability.quotes+json;version=1.1';
            } else if (urlPath === '/transfers') {
                expect(body).toEqual(bodyFn.transfers.post(body));
                putBody = await Promise.resolve(bodyFn.transfers.put(body));
                putUrl = `/transfers/${body.transferId}`;
                contentType = 'application/vnd.interoperability.transfers+json;version=1.1';
            } else {
                throw new Error(`Unexpected url ${urlPath}`);
            }

            if (putBody.errorInformation) putUrl += '/error';

            await currentRequest;
            currentRequest = reqInbound.put(putUrl)
                .send(putBody)
                .set('Date', new Date().toISOString())
                .set('content-type', contentType)
                .set('fspiop-source', 'mojaloop-sdk')
                .expect(200);

            return currentRequest;
        };

        function handleMockRequest(reqConfig) {
            pendingRequest = handleRequest({
                method: reqConfig.method,
                path: reqConfig.url,
                body: reqConfig.data,
                headers: reqConfig.headers,
            });
            return [202, null, jsonContentTypeHeader];
        }

        mockAxios.reset();
        if (bodyFn.parties) mockAxios.onGet(/^\/parties\//).reply(handleMockRequest);
        if (bodyFn.quotes) mockAxios.onPost('/quotes').reply(handleMockRequest);
        if (bodyFn.transfers) mockAxios.onPost('/transfers').reply(handleMockRequest);

        const res = await reqOutbound.post('/transfers').send(postTransfersSimpleBody);
        const { body } = res;

        expect(res.statusCode).toEqual(responseCode);

        cleanTransferState(body);
        expect(body).toEqual(responseBody);

        const responseSchema = apiSpecsOutbound.paths['/transfers'].post.responses[responseCode].content['application/json'].schema;

        const flatSchema = mergeAllOf(responseSchema);
        const validate = ajv.compile(flatSchema);

        const valid = validate(body);
        
        if (!valid) {
          console.error(validate.errors);
          throw new Error('Response validation failed');
        }
        await pendingRequest;
    };
}

module.exports = {
    createGetTransfersTester,
    createPostTransfersTester,
};
