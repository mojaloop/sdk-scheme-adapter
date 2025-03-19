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
function createPostAccountsTester({ reqInbound, reqOutbound, apiSpecsOutbound, reqParams = {} }, requestType=undefined) {
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

        const sendPutParticipantsForDelete = async (requestBody) => {
            const body = JSON.parse(requestBody);
            const putBody = await Promise.resolve(putBodyFn(body));
            let putUrl = `/participants/${reqParams.Type}/${reqParams.ID}`;
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

        if (requestType === 'deleteAccount') {
            mockAxios.onDelete(`/participants/${reqParams.Type}/${reqParams.ID}`).reply((reqConfig) => {
                pendingRequest = sendPutParticipantsForDelete('{ "fspId": "mojaloop-sdk" }');
                return [202, null, jsonContentTypeHeader];
            });
        } else {
            mockAxios.onPost('/participants').reply((reqConfig) => {
                pendingRequest = sendPutParticipants(reqConfig.data);
                return [202, null, jsonContentTypeHeader];
            });
        }

        let res = requestType === 'deleteAccount' 
            ? await reqOutbound.delete(`/accounts/${reqParams.Type}/${reqParams.ID}`) 
            : await reqOutbound.post('/accounts').send(postAccountsBody);
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

        if(body.deleteAccountResponse) {
            delete body.deleteAccountResponse.headers;
        }

        expect(body).toEqual(responseBody);

        const responseValidator = requestType === 'deleteAccount' 
            ? new OpenAPIResponseValidator(apiSpecsOutbound.paths['/accounts/{Type}/{ID}'].delete)
            : new OpenAPIResponseValidator(apiSpecsOutbound.paths['/accounts'].post);
        const err = responseValidator.validateResponse(responseCode, body);
        if (err) {
            throw err;
        }
        await pendingRequest;
    };
}

const createDeleteAccountTester = ({ reqInbound, reqOutbound, reqParams, apiSpecsOutbound }) => {
    return createPostAccountsTester({ reqInbound, reqOutbound, reqParams, apiSpecsOutbound }, 'deleteAccount');
}

module.exports = {
    createPostAccountsTester,
    createDeleteAccountTester,
};
