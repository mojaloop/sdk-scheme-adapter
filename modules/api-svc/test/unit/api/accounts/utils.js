const { mockAxios, jsonContentTypeHeader} = require('../../../helpers');
const postAccountsBody = require('./data/postAccountsBody');
const mergeAllOf = require('../utils').mergeAllOf;
const Ajv = require('ajv').default;
const ajv = new Ajv({ allErrors: true, strict: true });

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
        if(requestType === 'deleteAccount' && responseCode === 200) {
            delete body.modelId
        }
        expect(body).toEqual(responseBody);

        if(requestType === 'deleteAccount') {
            const responseSchema = apiSpecsOutbound.paths['/accounts/{Type}/{ID}'].delete.responses[responseCode].content['application/json'].schema;
            const flatSchema = mergeAllOf(responseSchema);        
            const validate = ajv.compile(flatSchema);
            
            const valid = validate(body);
            
            if (!valid) {
              console.error(validate.errors);
              throw new Error('Response validation failed');
            }
        } else {
            const responseSchema = apiSpecsOutbound.paths['/accounts'].post.responses[responseCode].content['application/json'].schema;
            const flatSchema = mergeAllOf(responseSchema);   
            const validate = ajv.compile(flatSchema);
            
            const valid = validate(body);
            
            if (!valid) {
              console.error(validate.errors);
              throw new Error('Response validation failed');
            }            
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
