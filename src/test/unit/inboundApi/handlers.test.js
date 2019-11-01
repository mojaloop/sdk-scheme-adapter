/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Vassilis Barzokas - vassilis.barzokas@modusbox.com               *
 **************************************************************************/

'use strict';

jest.mock('@internal/model').inboundTransfersModel;

const handlers = require('../../../inboundApi/handlers');
const Model = require('@internal/model').inboundTransfersModel;

describe('handlers:', () => {
    let mockArguments;

    beforeEach(() => {
        mockArguments = {
            quoteRequest: {
                quoteId: 'fake-quote-id',
                transactionId: 'fake-transaction-id',
                amountType: 'SEND',
                amount: {
                    currency: 'XOF',
                    amount: 10
                },
                expiration: '2019-06-04T04:02:10.378Z',
                payer: {
                    partyIdInfo: {
                        partyIdType: 'MSISDN',
                        partyIdentifier: '17855501914',
                        fspId: 'mojaloop-sdk'
                    },
                    personalInfo: {
                        complexName: {
                            firstName: 'Murthy',
                            lastName: 'Kakarlamudi'
                        },
                        dateOfBirth: '2010-10-10'
                    },
                    name: 'Murthy Kakarlamudi',
                    merchantClassificationCode: '123'
                },
            }
        };
    });

    describe('POST /quotes:', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArguments.quoteRequest,
                    headers: {
                        'fspiop-source': 'foo'
                    }
                },
                response: {},
                state: {
                    conf: {}
                }
            };
        });
        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            await handlers.map['/quotes'].post(mockContext);

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toBe(mockContext.request.body);
            expect(quoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });
});
