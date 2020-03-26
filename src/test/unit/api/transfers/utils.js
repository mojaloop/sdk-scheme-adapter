const request = require('request-promise-native');
const OpenAPIResponseValidator = require('openapi-response-validator').default;

const { Logger } = require('@internal/log');
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
        const TRANSFER_ID = '00000000-0000-1000-8000-000000000001';
        let pendingRequest = Promise.resolve();
        const handleRequest = async (req) => {
            const urlPath = new URL(req.uri).pathname;
            const method = req.method;
            expect(method).toBe('GET');
            expect(urlPath).toBe(`/transfers/${TRANSFER_ID}`);
            const putBody = await Promise.resolve(putBodyFn());
            let putUrl = `/transfers/${TRANSFER_ID}`;
            if (putBody.errorInformation) {
                putUrl += '/error';
            }
            await reqInbound.put(putUrl).
                send(putBody).
                set('Date', new Date().toISOString()).
                set('fspiop-source', 'mojaloop-sdk').
                expect(200);
        };
        const requestSpy = request.mockImplementation((req) => {
            pendingRequest = handleRequest(req);
            return Promise.resolve({headers: {}, statusCode: 202});
        });

        await reqOutbound.get(`/transfers/${TRANSFER_ID}`).then((res) => {
            const {body} = res;
            expect(body).toEqual(responseBody);
            const responseValidator = new OpenAPIResponseValidator(
                apiSpecsOutbound.paths['/transfers/{transferId}'].get);
            const err = responseValidator.validateResponse(responseCode, body);
            if (err) {
                console.log(body);
                throw err;
            }
        });

        await pendingRequest;
        requestSpy.mockRestore();
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
function createPostTransfersTester(
    { requestValidatorInbound, reqInbound, reqOutbound, apiSpecsOutbound }) {

    const logTransports = [() => {}];
    const logger = new Logger({
        context: { app: 'outbound-model-unit-tests' },
        space: 4,
        transports: logTransports,
    });

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
            const urlPath = new URL(req.uri).pathname;
            const body = req.body && JSON.parse(req.body);
            const headers = req.headers;
            const method = req.method;
            let putBody;
            let putUrl;
            requestValidatorInbound.validateRequest(
                {method, path: urlPath, request: {headers, body}}, logger);
            if (urlPath.startsWith('/parties/')) {
                expect(method).toBe('GET');
                putBody = await Promise.resolve(bodyFn.parties.put());
                putUrl = urlPath;
            } else if (urlPath === '/quotes') {
                expect(method).toBe('POST');
                expect(body).toEqual(bodyFn.quotes.post(body));
                putBody = await Promise.resolve(bodyFn.quotes.put(body));
                putUrl = `/quotes/${body.quoteId}`;
            } else if (urlPath === '/transfers') {
                expect(method).toBe('POST');
                expect(body).toEqual(bodyFn.transfers.post(body));
                putBody = await Promise.resolve(bodyFn.transfers.put(body));
                putUrl = `/transfers/${body.transferId}`;
            } else {
                throw new Error(`Unexpected url ${urlPath}`);
            }
            if (putBody.errorInformation) {
                putUrl += '/error';
            }
            // supertest have issues handling simultaneous requests,
            //  so just wait for the previous request to finish
            await currentRequest;
            currentRequest = reqInbound.put(putUrl).
                send(putBody).
                set('Date', new Date().toISOString()).
                set('fspiop-source', 'mojaloop-sdk').
                expect(200);
            await currentRequest;
        };
        const requestSpy = request.mockImplementation((req) => {
            pendingRequest = handleRequest(req);
            return Promise.resolve({headers: {}, statusCode: 202});
        });

        await reqOutbound.post('/transfers').
            send(postTransfersSimpleBody).
            then((res) => {
                const {body} = res;
                expect(body).toEqual(responseBody);
                const responseValidator = new OpenAPIResponseValidator(
                    apiSpecsOutbound.paths['/transfers'].post);
                const err = responseValidator.validateResponse(responseCode,
                    body);
                if (err) {
                    console.log(body);
                    throw err;
                }
            });

        await pendingRequest;
        requestSpy.mockRestore();
    };
}

module.exports = {
    createGetTransfersTester,
    createPostTransfersTester,
};
