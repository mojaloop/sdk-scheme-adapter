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

jest.mock('@internal/model');

const handlers = require('../../../InboundServer/handlers');
const Model = require('@internal/model').InboundTransfersModel;
const mockArguments = require('./data/mockArguments');
const { Logger, Transports } = require('@internal/log');

let logTransports;

describe('Inbound API handlers:', () => {
    let mockArgs;

    beforeAll(async () => {
        logTransports = await Promise.all([Transports.consoleDir()]);
    });

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
                    conf: {},
                    logger: new Logger({ context: { app: 'inbound-handlers-unit-test' }, space: 4, transports: logTransports })
                }
            };
        });

        test('calls `model.quoteRequest` with the expected arguments.', async () => {
            const quoteRequestSpy = jest.spyOn(Model.prototype, 'quoteRequest');

            try {
                await handlers.map['/quotes'].post.handler(mockContext);
            }
            catch(e) {
                expect(e).toBe(undefined);
            }

            expect(quoteRequestSpy).toHaveBeenCalledTimes(1);
            expect(quoteRequestSpy.mock.calls[0][0]).toBe(mockContext.request.body);
            expect(quoteRequestSpy.mock.calls[0][1]).toBe(mockContext.request.headers['fspiop-source']);
        });
    });
});
