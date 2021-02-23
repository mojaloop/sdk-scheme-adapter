'use strict';

const axios = require('axios');
const { uuid } = require('uuidv4');
const env = require('../../testEnv');
const authorizationsPostRequest = require('./data/authorizationsPostRequest.json');

jest.dontMock('redis');

describe('/authorizations', () => {

    test('post - happy flow', async () => {
        const postAuthorizationsURI = `${env.OutboundHostURI}/authorizations`;
        const transactionRequestId = uuid();
        const res = await axios({
            method: 'POST',
            url: postAuthorizationsURI,
            data: {
                fspId: 'switch',
                authorizationsPostRequest: {
                    ...authorizationsPostRequest,
                    transactionRequestId
                }
            },
            headers: {
                'access-control-allow-origin': '*'
            }
        });

        expect(res.status).toEqual(200);
        expect(res.data.currentState).toEqual('COMPLETED');
        expect(typeof res.data).toEqual('object');
    });

    test('post - timeout', (done) => {
        const postAuthorizationsURI = `${env.OutboundHostURI}/authorizations`;
        const transactionRequestId = uuid();
        axios({
            method: 'POST',
            url: postAuthorizationsURI,
            data: {
                fspId: 'timeout-fsp-id',
                authorizationsPostRequest: {
                    ...authorizationsPostRequest,
                    transactionRequestId
                }
            },
            headers: {
                'access-control-allow-origin': '*'
            }
        }).catch(err => {
            expect(err.response.status).toEqual(500);
            expect(err.response.data.message).toEqual('Timeout');
            done();
        });
    });

});
