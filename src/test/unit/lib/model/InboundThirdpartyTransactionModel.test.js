/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Sridhar Voruganti - sridhar.voruganti@modusbox.com               *
 **************************************************************************/
'use strict';

// we use a mock standard components lib to intercept and mock certain funcs
jest.mock('@mojaloop/sdk-standard-components');

const defaultConfig = require('./data/defaultConfig');
const ThirdpartyTrxnModelIn = require('@internal/model').InboundThirdpartyTransactionModel;
const mockAuthorizationArguments = require('./data/mockAuthorizationArguments');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');
const { BackendRequests } = require('@internal/requests');
const mockLogger = require('../../mockLogger');

describe('inboundThirdpartyTransactionModel', () => {
    let config;
    let mockAuthReqArgs;
    let logger;

    beforeEach(async () => {
        config = JSON.parse(JSON.stringify(defaultConfig));
        mockAuthReqArgs = JSON.parse(JSON.stringify(mockAuthorizationArguments));
        logger = mockLogger({ app: 'InboundThirdpartyTransactionModel-test' });
    });

    describe('authorizations', () => {
        let model;

        beforeEach(async () => {
            BackendRequests.__getSignedChallenge = jest.fn().mockReturnValue(
                Promise.resolve(mockAuthReqArgs.internalSignedChallengeResponse));

            model = new ThirdpartyTrxnModelIn({
                ...config,
                logger
            });
        });

        afterEach(async () => {
            MojaloopRequests.__putAuthorizations.mockClear();
        });

        test('calls `mojaloopRequests.putAuthorizations` with the expected arguments.', async () => {
            await model.postAuthorizations(mockAuthReqArgs.authorizationRequest, mockAuthReqArgs.fspId);
            expect(MojaloopRequests.__putAuthorizations).toHaveBeenCalledTimes(1);
            expect(MojaloopRequests.__putAuthorizations).toHaveBeenCalledWith(
                mockAuthReqArgs.authorizationRequest.transactionRequestId,
                mockAuthReqArgs.authorizationsResponse, mockAuthReqArgs.fspId);
        });
    });

});
