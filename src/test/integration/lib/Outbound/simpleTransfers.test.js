'use strict';

const axios = require('axios');
const { uuid } = require('uuidv4');
const env = require('../../testEnv');
const transfersPostRequest = require('./data/transfersPostRequest.json');

jest.dontMock('redis');

describe('/simpleTransfers', () => {

    test('post - happy flow', async () => {
        const postTransfersURI = `${env.OutboundHostURI}/simpleTransfers`;
        const transferId = uuid();
        const res = await axios({
            method: 'POST',
            url: postTransfersURI,
            data: {
                fspId: 'switch',
                transfersPostRequest: {
                    ...transfersPostRequest,
                    transferId
                }
            },
            headers: {
                'access-control-allow-origin': '*'
            }
        });

        expect(res.status).toEqual(200);
        expect(res.data.currentState).toEqual('COMPLETED');
        expect(typeof res.data.transfers).toEqual('object');
    });

    test('post - timeout', async (done) => {
        const postTransfersURI = `${env.OutboundHostURI}/simpleTransfers`;
        const transferId = uuid();
        axios({
            method: 'POST',
            url: postTransfersURI,
            data: {
                fspId: 'timeout-fsp-id-transfer',
                transfersPostRequest: {
                    ...transfersPostRequest,
                    transferId
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
