const request = require('request-promise-native');
const OpenAPIResponseValidator = require('openapi-response-validator').default;

const postAccountsBody = require('./data/postAccountsBody');

/**
 *
 * @param reqInbound
 * @param reqOutbound
 * @param apiSpecsOutbound
 * @returns Function(putBodyFn:function, responseCode:number, responseBody:object) => Promise
 */
function createPostAccountsTester({ reqInbound, reqOutbound, apiSpecsOutbound }) {
    /**
     *
     * @param putBodyFn {function}
     * @param responseCode {number}
     * @param responseBody {object}
     *
     * @return {Promise<any>}
     */
    return async (putBodyFn, responseCode, responseBody) => {
        let pendingRequest = Promise.resolve();
        const handleRequest = async (req) => {
            const urlPath = new URL(req.uri).pathname;
            const body = JSON.parse(req.body);
            const method = req.method;
            expect(method).toBe('POST');
            expect(urlPath).toBe('/participants');
            const putBody = await Promise.resolve(putBodyFn(body));
            let putUrl = `/participants/${body.requestId}`;
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
        await reqOutbound.post('/accounts').
            send(postAccountsBody).
            then((res) => {
                const {body} = res;
                expect(body).toEqual(responseBody);
                const responseValidator = new OpenAPIResponseValidator(
                    apiSpecsOutbound.paths['/accounts'].post);
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
    createPostAccountsTester,
};
