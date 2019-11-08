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
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');

describe('Inbound API handlers:', () => {
    let mockArgs;

    beforeEach(() => {
        mockArgs = JSON.parse(JSON.stringify(mockArguments));
    });

    describe('POST /quotes', () => {
        let mockContext;

        beforeEach(() => {
            mockContext = {
                request: {
                    body: mockArgs.quoteRequest,
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
