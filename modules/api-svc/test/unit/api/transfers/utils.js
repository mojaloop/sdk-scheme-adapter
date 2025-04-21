const { mockAxios, jsonContentTypeHeader} = require('../../../helpers');

const OpenAPIResponseValidator = require('openapi-response-validator').default;

const { logger } = require('../../../../src/lib/logger');
const postTransfersSimpleBody = require('./data/postTransfersSimpleBody');

/**
 *
 * @param reqInbound
 * @param reqOutbound
 * @param apiSpecsOutbound
 * @returns Function(putBodyFn:function, responseCode:number, responseBody:object) => Promise
 */
function createGetTransfersTester({ reqInbound, reqOutbound, apiSpecsOutbound }) {
    /**
     *
     * @param putBodyFn {function}
     * @param responseCode {number}
     * @param responseBody {object}

     * @return {Promise<any>}
     */
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
        const {body} = res;
        expect(res.statusCode).toEqual(responseCode);

        // remove elements of the response we do not want/need to compare for correctness.
        // timestamps on requests/responses for example will be set by the HTTP framework
        // and we dont want to compare against static values.
        delete body.initiatedTimestamp;
        if (body.transferState) {
            delete body.transferState.initiatedTimestamp;
            if(body.transferState.quoteResponse) {
                delete body.transferState.quoteResponse.headers;
            }
            if(body.transferState.getPartiesResponse) {
                delete body.transferState.getPartiesResponse.headers;
            }
            if(body.transferState.fulfil) {
                delete body.transferState.fulfil.headers;
            }
            if(body.transferState.quoteRequest) {
                delete body.transferState.quoteRequest;
            }
            if(body.transferState.getPartiesRequest) {
                delete body.transferState.getPartiesRequest;
            }
            if(body.transferState.prepare) {
                delete body.transferState.prepare;
            }
        }
        if(body.quoteResponse) {
            delete body.quoteResponse.headers;
        }
        if(body.getPartiesResponse) {
            delete body.getPartiesResponse.headers;
        }
        if(body.fulfil) {
            delete body.fulfil.headers;
        }
        if(body.quoteRequest) {
            delete body.quoteRequest;
        }
        if(body.getPartiesRequest) {
            delete body.getPartiesRequest;
        }
        if(body.prepare) {
            delete body.prepare;
        }
        expect(body).toEqual(responseBody);
        const responseValidator = new OpenAPIResponseValidator(apiSpecsOutbound.paths['/transfers/{transferId}'].get);
        const err = responseValidator.validateResponse(responseCode, body);
        if (err) {
            throw err;
        }
    };
}

/**
 *
 * @param requestValidatorInbound
 * @param reqInbound
 * @param reqOutbound
 * @param apiSpecsOutbound
 * @returns Function(bodyFn:object, responseCode:number, responseBody:object) => Promise
 */
function createPostTransfersTester({
    requestValidatorInbound, reqInbound, reqOutbound, apiSpecsOutbound
}) {

    /**
     *
     * @param bodyFn {Object}
     * @param responseCode {number}
     * @param bodyFn.parties {object}
     * @param bodyFn.parties.put {function}
     * @param bodyFn.quotes {object}
     * @param bodyFn.quotes.put {function}
     * @param bodyFn.quotes.post {function}
     * @param bodyFn.transfers {object}
     * @param bodyFn.transfers.put {function}
     * @param bodyFn.transfers.post {function}
     * @param responseBody {object}

     * @return {Promise<any>}
     */
    return async (bodyFn, responseCode, responseBody) => {
        let pendingRequest = Promise.resolve();
        let currentRequest = Promise.resolve();

        const handleRequest = async (req) => {
            const urlPath = req.path;
            const body = req.body && JSON.parse(req.body);
            const headers = req.headers;
            const method = req.method;
            let putBody;
            let putUrl;
            let contentType;
            requestValidatorInbound.validateRequest(
                {method, path: urlPath, request: {headers, body}}, logger);
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
            if (putBody.errorInformation) {
                putUrl += '/error';
            }
            // supertest experiencing issues handling simultaneous requests,
            //  so just wait for the previous request to finish
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
        if (bodyFn.parties) {
            mockAxios.onGet(/^\/parties\//).reply(handleMockRequest);
        }
        if (bodyFn.quotes) {
            mockAxios.onPost('/quotes').reply(handleMockRequest);
        }
        if (bodyFn.transfers) {
            mockAxios.onPost('/transfers').reply(handleMockRequest);
        }

        const res = await reqOutbound.post('/transfers').send(postTransfersSimpleBody);
        const {body} = res;

        expect(res.statusCode).toEqual(responseCode);

        // remove elements of the response we do not want/need to compare for correctness.
        // timestamps on requests/responses for example will be set by the HTTP framework
        // and we dont want to compare against static values.
        delete body.initiatedTimestamp;
        if (body.transferState) {
            delete body.transferState.initiatedTimestamp;
            if(body.transferState.quoteResponse) {
                delete body.transferState.quoteResponse.headers;
            }
            if(body.transferState.getPartiesResponse) {
                delete body.transferState.getPartiesResponse.headers;
            }
            if(body.transferState.fulfil) {
                delete body.transferState.fulfil.headers;
            }
            if(body.transferState.quoteRequest) {
                delete body.transferState.quoteRequest;
            }
            if(body.transferState.getPartiesRequest) {
                delete body.transferState.getPartiesRequest;
            }
            if(body.transferState.prepare) {
                delete body.transferState.prepare;
            }
            delete body.transferState.traceId;
        }
        if(body.quoteResponse) {
            delete body.quoteResponse.headers;
        }
        if(body.getPartiesResponse) {
            delete body.getPartiesResponse.headers;
        }
        if(body.fulfil) {
            delete body.fulfil.headers;
        }
        if(body.quoteRequest) {
            delete body.quoteRequest;
        }
        if(body.getPartiesRequest) {
            delete body.getPartiesRequest;
        }
        if(body.prepare) {
            delete body.prepare;
        }
        if(body.quoteResponse?.originalIso20022QuoteResponse) {
            delete body.quoteResponse.originalIso20022QuoteResponse;
        }
        delete body.traceId;

        expect(body).toEqual(responseBody);
        const responseValidator = new OpenAPIResponseValidator(apiSpecsOutbound.paths['/transfers'].post);
        const err = responseValidator.validateResponse(responseCode, body);
        if (err) {
            logger.push({ error: err }).error('validateResponse error');
            throw err;
        }
        await pendingRequest;
    };
}

module.exports = {
    createGetTransfersTester,
    createPostTransfersTester,
};
