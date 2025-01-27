const crypto = require('node:crypto');

const { mockAxios, jsonContentTypeHeader} = require('../../../helpers');
const requestBody = require('./data/requestBody');
const requestHeaders = require('./data/requestHeaders');
const requestQuery = require('./data/requestQuery');
const responseBodyJSON = require('./data/responseBody');
const responseHeaders = require('./data/responseHeaders');

const responseBodyBinary = crypto.randomBytes(10000);

const convertToLowerCaseKeys = (obj) => Object.entries(obj).reduce(
    (acc, [k, v]) => ({...acc, [k.toLowerCase()]: v}),
    {},
);

/**
 *
 * @param reqOutbound
 * @returns Function => Promise
 */
function createProxyTester({ reqOutbound }) {
    /**
     *
     * @param sdkUrlPath {string}
     * @param switchUrlPath {string}
     * @param method {string} - one of POST, GET, PUT
     * @param expectedStatusCode {number}
     *
     * @return {Promise<any>}
     */
    return async ({ sdkUrlPath, method, shouldForward, query, headers, binary }) => {
        const responseBody = binary ? responseBodyBinary : responseBodyJSON;
        const resHeaders = binary ? responseHeaders : { ...responseHeaders, ...jsonContentTypeHeader };

        mockAxios.reset();
        mockAxios.onAny().reply(() => {
            return [200, responseBody, resHeaders];
        });

        const res = await reqOutbound[method.toLowerCase()](sdkUrlPath)
            .query({
                ...requestQuery,
                ...query,
            })
            .send(requestBody)
            .set({
                ...requestHeaders,
                ...headers,
            });

        if (shouldForward) {
            const expectedHeaders = convertToLowerCaseKeys(responseHeaders);
            const receivedHeaders = convertToLowerCaseKeys(res.headers);
            expect(res.body).toEqual(responseBody);
            expect(receivedHeaders).toMatchObject(expectedHeaders);
            expect(res.statusCode).toBe(200);
        } else {
            expect(res.body).toEqual({
                'message': `Couldn't match path ${sdkUrlPath}`,
                'statusCode': 400,
            });
            expect(res.statusCode).toBe(400);
        }
    };
}

module.exports = {
    createProxyTester,
};
