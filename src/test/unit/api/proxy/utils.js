const request = require('request-promise-native');

const requestBody = require('./data/requestBody');
const requestHeaders = require('./data/requestHeaders');
const requestQuery = require('./data/requestQuery');
const responseBody = require('./data/responseBody');
const responseHeaders = require('./data/responseHeaders');

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
    return async ({sdkUrlPath, switchUrlPath, method, shouldForward, query, headers}) => {
        const requestSpy = request.mockImplementation((req) => {
            const urlPath = new URL(req.uri).pathname;
            const receivedParam = new URL(req.uri).search;
            const expectedParam = new URL(`http://example.com${sdkUrlPath}`).search;
            expect(receivedParam).toBe(expectedParam);
            expect(req.method).toBe(method);
            expect(urlPath).toBe(switchUrlPath);
            if (method !== 'GET') {
                const body = JSON.parse(req.body);
                expect(body).toEqual(requestBody);
            }
            const expectedHeaders = convertToLowerCaseKeys({
                ...requestHeaders,
                ...headers,
            });
            const receivedHeaders = convertToLowerCaseKeys(req.headers);
            expect(receivedHeaders).toMatchObject(expectedHeaders);
            expect(req.qs).toMatchObject({
                ...requestQuery,
                ...query,
            });
            const response = {
                headers: responseHeaders,
                body: JSON.stringify(responseBody),
                statusCode: 200,
            };
            return Promise.resolve(response);
        });

        const res = await reqOutbound[method.toLowerCase()](sdkUrlPath).
            query({
                ...requestQuery,
                ...query,
            }).
            send(requestBody).
            set({
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

        requestSpy.mockRestore();
    };
}

module.exports = {
    createProxyTester,
};
