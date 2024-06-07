'use strict';

const axios = require('axios');
const uuid = require('@mojaloop/central-services-shared').Util.id({version: 4});
const env = require('../../testEnv');
const transfersPostRequest = require('./data/transfersPostRequest.json');
const { SDKStateEnum } = require('../../../../src/lib/model/common');

jest.dontMock('redis');

/*
"TRANSFERS_VALIDATION_WITH_PREVIOUS_QUOTES": false,
"TRANSFERS_VALIDATION_ILP_PACKET": false,
"TRANSFERS_VALIDATION_CONDITION": false,

Ensure these values in the TTK `user_config.json` file are set to false.
Since we are testing the /transfers endpoint in isolation without a prior
quote and a fake `ilpPacket` and `condition`.
*/
describe('/simpleTransfers', () => {

    test('post - happy flow', async () => {
        const postTransfersURI = `${env.OutboundHostURI}/simpleTransfers`;
        const transferId = uuid();
        let res;
        try {
            res = await axios({
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

        } catch (err) {
            console.log(err);
        }

        expect(res.status).toEqual(200);
        expect(res.data.currentState).toEqual(SDKStateEnum.COMPLETED);
        expect(typeof res.data.transfer).toEqual('object');
        expect(typeof res.data.transfer.body).toEqual('object');
        expect(typeof res.data.transfer.headers).toEqual('object');
    });

    test('post - timeout', async () => {
        const postTransfersURI = `${env.OutboundHostURI}/simpleTransfers`;
        const transferId = uuid();
        try {
            await axios({
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
            });
        } catch (err) {
            expect(err.response.status).toEqual(500);
            expect(err.response.data.message).toEqual('Timeout');
        }
    });
});
