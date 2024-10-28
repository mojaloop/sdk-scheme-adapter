/*************************************************************************
 *  (C) Copyright Mojaloop Foundation. 2024 - All rights reserved.        *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - jbush@mojaloop.io                                   *
 *                                                                        *
 *  CONTRIBUTORS:                                                         *
 *       James Bush - jbush@mojaloop.io                                   *
 *************************************************************************/

'use strict';

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.mock('redis');
jest.unmock('@mojaloop/sdk-standard-components');

const { Logger } = require('@mojaloop/sdk-standard-components');
const { MojaloopRequests } = jest.requireActual('@mojaloop/sdk-standard-components');

const Cache = require('~/lib/cache');
const { MetricsClient } = require('~/lib/metrics');
const Model = require('~/lib/model').OutboundTransfersModel;
const PartiesModel = require('~/lib/model').PartiesModel;

const StateMachine = require('javascript-state-machine');

const defaultConfig = require('./data/defaultConfig');
const transferRequest = require('./data/transferRequest');
const payeeParty = require('./data/payeeParty');
const quoteResponse = require('./data/quoteResponse');
const transferFulfil = require('./data/transferFulfil');
const fspiopPostQuotesRequest = require('../../data/postQuotesBody.json');

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
    originalRequest: {}
};

const dummyQuoteRequestsModuleResponse = {
    originalRequest: {
        headers: {},
        body: fspiopPostQuotesRequest
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
        logger = new Logger.Logger({ context: { app: 'outbound-model-unit-tests-cache' }, stringify: () => '' });
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
        let postTransfersBody;

        // mock the final method MojaloopRequests calls to send the http request
        // this allows us to spy on the request body being sent
        jest.spyOn(Object.getPrototypeOf(MojaloopRequests.prototype), '_request').mockImplementation(async (opts, responseType) => {
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

                postQuotesBody = JSON.parse(opts.body);

                expect(postQuotesBody.CdtTrfTxInf).not.toBeUndefined();
                expect(postQuotesBody.CdtTrfTxInf.PmtId).not.toBeUndefined();
                expect(postQuotesBody.CdtTrfTxInf.PmtId.TxId).not.toBeUndefined();

                // simulate a callback with the quote response
                emitQuoteResponseCacheMessage(cache, postQuotesBody.CdtTrfTxInf.PmtId.TxId, quoteResponse);
                return Promise.resolve(dummyQuoteRequestsModuleResponse);
            }

            if(opts.uri.includes('transfers') && opts.method === 'POST') {
                // transfer prepare called
                expect(opts.body).not.toBeUndefined();

                let postTransfersBody = JSON.parse(opts.body);

                expect(postTransfersBody.CdtTrfTxInf).not.toBeUndefined();
                expect(postTransfersBody.CdtTrfTxInf.PmtId).not.toBeUndefined();
                expect(postTransfersBody.CdtTrfTxInf.PmtId.TxId).not.toBeUndefined();

                // Fields that require prior POST quotes context should be present
                expect(postTransfersBody.CdtTrfTxInf.ChrgBr).toEqual('CRED');
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
