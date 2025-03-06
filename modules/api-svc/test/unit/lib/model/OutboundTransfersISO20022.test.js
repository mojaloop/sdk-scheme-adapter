/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - James Bush <jbush@mojaloop.io>
 --------------
 ******/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.mock('redis');
jest.unmock('@mojaloop/sdk-standard-components');

const StateMachine = require('javascript-state-machine');
const { MojaloopRequests } = jest.requireActual('@mojaloop/sdk-standard-components');

const Cache = require('~/lib/cache');
const Model = require('~/lib/model').OutboundTransfersModel;
const PartiesModel = require('~/lib/model').PartiesModel;
const { createLogger } = require('~/lib/logger');
const { MetricsClient } = require('~/lib/metrics');

const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');
const payeeParty = require('./data/payeeParty');
const quoteResponse = require('./data/quoteResponse');
const transferFulfil = require('./data/transferFulfil');

const { SDKStateEnum } = require('../../../../src/lib/model/common');

const genPartyId = (party) => {
    const { partyIdType, partyIdentifier, partySubIdOrType } = party.body.party.partyIdInfo;
    return PartiesModel.channelName({
        type: partyIdType,
        id: partyIdentifier,
        subId: partySubIdOrType
    });
};


const dummyRequestsModuleResponse = {
    originalRequest: {},

};
const originalIso20022QuoteResponse = {
    'GrpHdr': {
        'MsgId': '01JBFFD18ZTQSVVYQ419WNFB22',
        'CreDtTm': '2024-10-30T19:45:50.879Z',
        'NbOfTxs': '1',
        'SttlmInf': {
            'SttlmMtd': 'CLRG'
        },
        'PmtInstrXpryDtTm': '2024-10-30T19:46:50.878Z'
    },
    'CdtTrfTxInf': {
        'PmtId': {
            'TxId': '01JBFFD182CCQ9X0RG143CZM0A'
        },
        'Dbtr': {
            'Id': {
                'PrvtId': {
                    'Othr': {
                        'SchmeNm': {
                            'Prtry': 'MSISDN'
                        },
                        'Id': '44123456789'
                    }
                }
            }
        },
        'DbtrAgt': {
            'FinInstnId': {
                'Othr': {
                    'Id': 'testingtoolkitdfsp'
                }
            }
        },
        'Cdtr': {
            'Id': {
                'PrvtId': {
                    'Othr': {
                        'SchmeNm': {
                            'Prtry': 'MSISDN'
                        },
                        'Id': '27713803912'
                    }
                }
            }
        },
        'CdtrAgt': {
            'FinInstnId': {
                'Othr': {
                    'Id': 'payeefsp'
                }
            }
        },
        'ChrgBr': 'DEBT',
        'IntrBkSttlmAmt': {
            'Ccy': 'XXX',
            'ActiveCurrencyAndAmount': '100'
        },
        'ChrgsInf': {
            'Amt': {
                'Ccy': 'XXX',
                'ActiveOrHistoricCurrencyAndAmount': '5'
            },
            'Agt': {
                'FinInstnId': {
                    'Othr': {
                        'Id': 'payeefsp'
                    }
                }
            }
        },
        'VrfctnOfTerms': {
            'IlpV4PrepPacket': 'DIICtgAAAAAAAABkMjAyNDEwMzAxOTQ2NTA4NzgZAqBJ87fHeZXM6R20d_r-M9YFc7soJySdK1G02BVlPQpnLm1vamFsb29wggJvZXlKeGRXOTBaVWxrSWpvaU1ERktRa1pHUkRFNE1rTkRVVGxZTUZKSE1UUXpRMXBOTUVFaUxDSjBjbUZ1YzJGamRHbHZia2xrSWpvaU1ERktRa1pHUkRFNE1rTkRVVGxZTUZKSE1UUXpRMXBOTUVJaUxDSjBjbUZ1YzJGamRHbHZibFI1Y0dVaU9uc2ljMk5sYm1GeWFXOGlPaUpVVWtGT1UwWkZVaUlzSW1sdWFYUnBZWFJ2Y2lJNklsQkJXVVZTSWl3aWFXNXBkR2xoZEc5eVZIbHdaU0k2SWtKVlUwbE9SVk5USW4wc0luQmhlV1ZsSWpwN0luQmhjblI1U1dSSmJtWnZJanA3SW5CaGNuUjVTV1JVZVhCbElqb2lUVk5KVTBST0lpd2ljR0Z5ZEhsSlpHVnVkR2xtYVdWeUlqb2lNamMzTVRNNE1ETTVNVElpTENKbWMzQkpaQ0k2SW5CaGVXVmxabk53SW4xOUxDSndZWGxsY2lJNmV5SndZWEowZVVsa1NXNW1ieUk2ZXlKd1lYSjBlVWxrVkhsd1pTSTZJazFUU1ZORVRpSXNJbkJoY25SNVNXUmxiblJwWm1sbGNpSTZJalEwTVRJek5EVTJOemc1SWl3aVpuTndTV1FpT2lKMFpYTjBhVzVuZEc5dmJHdHBkR1JtYzNBaWZYMHNJbVY0Y0dseVlYUnBiMjRpT2lJeU1ESTBMVEV3TFRNd1ZERTVPalEyT2pVd0xqZzNPRm9pTENKaGJXOTFiblFpT25zaVlXMXZkVzUwSWpvaU1UQXdJaXdpWTNWeWNtVnVZM2tpT2lKWVdGZ2lmWDA'
        }
    }
};
// util function to simulate a party resolution subscription message on a cache client
const emitPartyCacheMessage = (cache, party) => cache.publish(genPartyId(party), JSON.stringify(party));

// util function to simulate a quote response subscription message on a cache client
const emitQuoteResponseCacheMessage = (cache, quoteId, quoteResponse) => cache.publish(`qt_${quoteId}`, JSON.stringify(quoteResponse));

// util function to simulate a transfer fulfilment subscription message on a cache client
const emitTransferFulfilCacheMessage = (cache, transferId, fulfil) => cache.publish(`tf_${transferId}`, JSON.stringify(fulfil));


describe('API_TYPE="iso20022"', () => {
    let config;
    let cache;
    let logger;
    let metricsClient;

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        logger = createLogger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
        cache = new Cache({
            cacheUrl: 'redis://dummy:1234',
            logger,
            unsubscribeTimeoutMs: 5000
        });
        await cache.connect();

        metricsClient = new MetricsClient();
        metricsClient._prometheusRegister.clear();
        config.wso2 = {
            auth: {
                getToken: () => { return '1234'; }
            }
        };
        config.jwsSign = false;
        config.checkIlp = false;
        config.apiType = 'iso20022';
        config.autoAcceptParty = true;
        config.autoAcceptQuotes = true;
    });

    test('executes all three transfer stages sending ISO20022 request bodies to the peer when API_TYPE="iso20022"', async () => {
        let postQuotesBody;

        // mock the final method MojaloopRequests calls to send the http request
        // this allows us to spy on the request body being sent
        jest.spyOn(Object.getPrototypeOf(MojaloopRequests.prototype), '_request').mockImplementation(async (opts) => {
            // console.log(`_reqeust called ${opts}`);
            if(opts.uri.includes('parties') && opts.method === 'GET') {
                //get parties called
                // simulate a callback with the get party response
                emitPartyCacheMessage(cache, payeeParty);
                return Promise.resolve(dummyRequestsModuleResponse);
            }

            if(opts.uri.includes('quotes') && opts.method === 'POST') {
                // post quotes called
                expect(opts.body).not.toBeUndefined();

                postQuotesBody = opts.body;

                expect(postQuotesBody.CdtTrfTxInf).not.toBeUndefined();
                expect(postQuotesBody.CdtTrfTxInf.PmtId).not.toBeUndefined();
                expect(postQuotesBody.CdtTrfTxInf.PmtId.TxId).not.toBeUndefined();

                // simulate a callback with the quote response
                const quoteResponseCopy = JSON.parse(JSON.stringify(quoteResponse));
                quoteResponseCopy.data.originalIso20022QuoteResponse = originalIso20022QuoteResponse;
                emitQuoteResponseCacheMessage(cache, postQuotesBody.CdtTrfTxInf.PmtId.TxId, quoteResponseCopy);
                return Promise.resolve(dummyRequestsModuleResponse);
            }

            if(opts.uri.includes('transfers') && opts.method === 'POST') {
                // transfer prepare called
                expect(opts.body).not.toBeUndefined();

                let postTransfersBody = opts.body;

                expect(postTransfersBody.CdtTrfTxInf).not.toBeUndefined();
                expect(postTransfersBody.CdtTrfTxInf.PmtId).not.toBeUndefined();
                expect(postTransfersBody.CdtTrfTxInf.PmtId.TxId).not.toBeUndefined();

                // Fields that require prior POST quotes response $context should be present
                expect(postTransfersBody.CdtTrfTxInf.ChrgBr).toEqual('DEBT');
                expect(postTransfersBody.CdtTrfTxInf.Cdtr).toBeDefined();
                expect(postTransfersBody.CdtTrfTxInf.Dbtr).toBeDefined();

                // simulate a callback with the transfer fulfilment
                emitTransferFulfilCacheMessage(cache, postTransfersBody.CdtTrfTxInf.PmtId.TxId, transferFulfil);
                return Promise.resolve(dummyRequestsModuleResponse);
            }

            throw new Error('nothing matched');
        });

        const model = new Model({
            cache,
            logger,
            metricsClient,
            ...config,
        });

        await model.initialize(JSON.parse(JSON.stringify(transferRequest)));

        expect(StateMachine.__instance.state).toBe('start');

        // start the model running
        const result = await model.run();

        // check we stopped at payeeResolved state
        expect(result.currentState).toBe(SDKStateEnum.COMPLETED);
        expect(StateMachine.__instance.state).toBe('succeeded');
    });
});
