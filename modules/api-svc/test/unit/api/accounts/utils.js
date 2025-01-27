const OpenAPIResponseValidator = require('openapi-response-validator').default;

const { mockAxios, jsonContentTypeHeader} = require('../../../helpers');
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

        const sendPutParticipants = async (requestBody) => {
            const body = JSON.parse(requestBody);
            const putBody = await Promise.resolve(putBodyFn(body));
            let putUrl = `/participants/${body.requestId}`;
            if (putBody.errorInformation) {
                putUrl += '/error';
            }

            return reqInbound.put(putUrl)
                .send(putBody)
                .set('Date', new Date().toISOString())
                .set('content-type', 'application/vnd.interoperability.participants+json;version=1.1')
                .set('fspiop-source', 'mojaloop-sdk')
                .expect(200);
        };

        mockAxios.reset();
        mockAxios.onPost('/participants').reply((reqConfig) => {
            pendingRequest = sendPutParticipants(reqConfig.data);
            return [202, null, jsonContentTypeHeader];
        });

        const res = await reqOutbound.post('/accounts').send(postAccountsBody);
        const {body} = res;
        expect(res.statusCode).toEqual(responseCode);

        // remove elements of the response we do not want/need to compare for correctness.
        // timestamps on requests/responses for example will be set by the HTTP framework
        // and we dont want to compare against static values.
        if (body.executionState) {
            if(body.executionState.postAccountsResponse) {
                delete body.executionState.postAccountsResponse.headers;
            }
        }

        if(body.postAccountsResponse) {
            delete body.postAccountsResponse.headers;
        }

        expect(body).toEqual(responseBody);
        const responseValidator = new OpenAPIResponseValidator(apiSpecsOutbound.paths['/accounts'].post);
        const err = responseValidator.validateResponse(responseCode, body);
        if (err) {
            throw err;
        }
        await pendingRequest;
    };
}

module.exports = {
    createPostAccountsTester,
};
