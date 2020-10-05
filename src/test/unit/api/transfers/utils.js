const nock = require('nock');
const OpenAPIResponseValidator = require('openapi-response-validator').default;

const { Logger } = require('@mojaloop/sdk-standard-components');
const defaultConfig = require('../../data/defaultConfig');
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
        const endpoint = new URL(`http://${defaultConfig.peerEndpoint}`).host;
        const switchEndpoint = `http://${endpoint}`;

        const sendPutTransfers = async () => {
            const putBody = await Promise.resolve(putBodyFn());
            let putUrl = `/transfers/${TRANSFER_ID}`;
            if (putBody.errorInformation) {
                putUrl += '/error';
            }

            return reqInbound.put(putUrl)
                .send(putBody)
                .set('Date', new Date().toISOString())
                .set('fspiop-source', 'mojaloop-sdk')
                .expect(200);
        };

        await nock(switchEndpoint)
            .get(`/transfers/${TRANSFER_ID}`)
            .reply(202, () => {
                sendPutTransfers().then();
            });

        const res = await reqOutbound.get(`/transfers/${TRANSFER_ID}`);
        const {body} = res;
        expect(res.statusCode).toEqual(responseCode);
        delete body.initiatedTimestamp;
        if (body.transferState) {
            delete body.transferState.initiatedTimestamp;
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
function createPostTransfersTester(
    { requestValidatorInbound, reqInbound, reqOutbound, apiSpecsOutbound }) {

    const logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests' }, stringify: () => '' });

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
            requestValidatorInbound.validateRequest(
                {method, path: urlPath, request: {headers, body}}, logger);
            if (urlPath.startsWith('/parties/')) {
                putBody = await Promise.resolve(bodyFn.parties.put());
                putUrl = urlPath;
            } else if (urlPath === '/quotes') {
                expect(body).toEqual(bodyFn.quotes.post(body));
                putBody = await Promise.resolve(bodyFn.quotes.put(body));
                putUrl = `/quotes/${body.quoteId}`;
            } else if (urlPath === '/transfers') {
                expect(body).toEqual(bodyFn.transfers.post(body));
                putBody = await Promise.resolve(bodyFn.transfers.put(body));
                putUrl = `/transfers/${body.transferId}`;
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
                .set('fspiop-source', 'mojaloop-sdk')
                .expect(200);
            return currentRequest;
        };

        function handleNockRequest(uri, body) {
            pendingRequest = handleRequest({
                method: this.method.toLowerCase(),
                path: uri,
                body,
                headers: this.req.headers,
            }).then();
        }

        const endpoint = new URL(`http://${defaultConfig.peerEndpoint}`).host;
        const switchEndpoint = `http://${endpoint}`;

        const nockMock = nock(switchEndpoint);
        if (bodyFn.parties) {
            nockMock.get(/^\/parties\//).reply(202, handleNockRequest);
        }
        if (bodyFn.quotes) {
            nockMock.post('/quotes').reply(202, handleNockRequest);
        }
        if (bodyFn.transfers) {
            nockMock.post('/transfers').reply(202, handleNockRequest);
        }

        const res = await reqOutbound.post('/transfers').send(postTransfersSimpleBody);
        const {body} = res;
        expect(res.statusCode).toEqual(responseCode);
        delete body.initiatedTimestamp;
        if (body.transferState) {
            delete body.transferState.initiatedTimestamp;
        }
        expect(body).toEqual(responseBody);
        const responseValidator = new OpenAPIResponseValidator(apiSpecsOutbound.paths['/transfers'].post);
        const err = responseValidator.validateResponse(responseCode, body);
        if (err) {
            throw err;
        }
        await pendingRequest;
    };
}

module.exports = {
    createGetTransfersTester,
    createPostTransfersTester,
};
