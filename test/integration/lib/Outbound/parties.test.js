'use strict';

const axios = require('axios');
const env = require('../../testEnv');

jest.dontMock('redis');

describe('/parties', () => {

    test('get - happy flow', async () => {
        const getPartiesURI = `${env.OutboundHostURI}/parties/MSISDN/1234567890`;
        const res = await axios.get(getPartiesURI);

        expect(res.status).toEqual(200);
        expect(res.data.currentState).toEqual('COMPLETED');
        expect(typeof res.data.party).toEqual('object');
        expect(typeof res.data.party.body).toEqual('object');
        expect(typeof res.data.party.headers).toEqual('object');
    });

    test('get - timeout', (done) => {
        const getPartiesURI = `${env.OutboundHostURI}/parties/MSISDN/0987654321`;
        axios.get(getPartiesURI).catch(err => {
            expect(err.response.status).toEqual(500);
            expect(err.response.data.message).toEqual('Timeout');
            done();
        });

    });
});
