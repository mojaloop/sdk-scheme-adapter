'use strict';

const axios = require('axios');
const { uuid } = require('uuidv4');
const env = require('../../testEnv');
const quotesPostRequest = require('./data/quotesPostRequest.json');

jest.dontMock('redis');
jest.setTimeout(10000);
describe('/quotes', () => {

    test('post - happy flow', async () => {
        const postQuotesURI = `${env.OutboundHostURI}/quotes`;
        const quoteId = uuid();
        const res = await axios({
            method: 'POST',
            url: postQuotesURI,
            data: {
                fspId: 'switch',
                quotesPostRequest: {
                    ...quotesPostRequest,
                    quoteId
                }
            },
            headers: {
                'access-control-allow-origin': '*'
            }
        });

        expect(res.status).toEqual(200);
        expect(res.data.currentState).toEqual('COMPLETED');
        expect(typeof res.data.quotes).toEqual('object');
    });

    test('post - timeout', (done) => {
        const postQuotesURI = `${env.OutboundHostURI}/quotes`;
        const quoteId = uuid();
        axios({
            method: 'POST',
            url: postQuotesURI,
            data: {
                fspId: 'timeout-fsp-id',
                quotesPostRequest: {
                    ...quotesPostRequest,
                    quoteId
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
