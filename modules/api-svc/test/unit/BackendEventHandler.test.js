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
 - Name Surname <name.surname@mojaloop.io>

 --------------
 ******/

const { BackendEventHandler } = require('../../src/BackendEventHandler');
const { BackendRequests } = require('../../src/lib/model/lib/requests');
const { SDKStateEnum } = require('../../src/lib/model/common');
const { createLogger } = require('../../src/lib/logger');
const config = require('./data/defaultConfig.json');
const bulkTransactionResponse = require('./lib/model/data/bulkTransactionResponse.json');
const {
    SDKOutboundBulkAcceptPartyInfoRequestedDmEvt,
    SDKOutboundBulkAcceptQuoteRequestedDmEvt,
    SDKOutboundBulkResponsePreparedDmEvt,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const {
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');

const logger = createLogger({ context: { app: 'BackendEventHandler' }, stringify: () => '' });

describe('BackendEventHandler', () => {
    const putBulkTransactions = jest.spyOn(BackendRequests.prototype, 'putBulkTransactions').mockImplementation(async () => ({}));

    afterEach(() => {
        putBulkTransactions.mockClear();
    });

    test('handle SDKOutboundBulkAcceptPartyInfoRequestedDmEvt event', async () => {
        const backendEventHandler = new BackendEventHandler({
            config,
            logger,
        });
        await backendEventHandler.start();
        const request = {
            bulkHomeTransactionID: 'home-tx-id',
            individualTransfers: [
                {
                    homeTransactionId: 'home-tx-id-1',
                    transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                },
            ]
        };
        const bulkId = 'bulk-tx-test';
        const event = new SDKOutboundBulkAcceptPartyInfoRequestedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            request,
        });

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        expect(putBulkTransactions).toBeCalledWith(bulkId, {
            ...request,
            currentState: 'WAITING_FOR_PARTY_ACCEPTANCE',
        });

        await backendEventHandler.stop();
    });

    test('handle SDKOutboundBulkAcceptQuoteRequestedDmEvt event', async () => {
        const backendEventHandler = new BackendEventHandler({
            config,
            logger,
        });
        await backendEventHandler.start();
        const bulkAcceptQuoteRequest = {
            bulkHomeTransactionID: 'home-tx-id',
            individualTransfers: [
                {
                    homeTransactionId: 'home-tx-id-1',
                    transactionId: 'b51ec534-ee48-4575-b6a9-ead2955b8069',
                },
            ]
        };
        const bulkId = 'bulk-tx-test';
        const event = new SDKOutboundBulkAcceptQuoteRequestedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            bulkAcceptQuoteRequest,
        });

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        expect(putBulkTransactions).toBeCalledWith(bulkId, {
            ...bulkAcceptQuoteRequest,
            currentState: 'WAITING_FOR_QUOTE_ACCEPTANCE',
        });

        await backendEventHandler.stop();
    });

    test('handle SDKOutboundBulkResponsePreparedDmEvt event', async () => {
        const backendEventHandler = new BackendEventHandler({
            config,
            logger,
        });
        await backendEventHandler.start();
        const bulkId = 'bulk-tx-test';
        const event = new SDKOutboundBulkResponsePreparedDmEvt({
            bulkId,
            headers: [],
            timestamp: Date.now(),
            bulkTransactionResponse,
        });

        const handler = KafkaDomainEventConsumer.mock.ctor.mock.calls[0][0];
        await handler(event);

        expect(putBulkTransactions).toBeCalledWith(bulkId, {
            ...bulkTransactionResponse,
            currentState: SDKStateEnum.COMPLETED,
        });

        const sent = KafkaDomainEventProducer.mock.sendDomainEvent.mock.calls[0][0];
        expect(sent._data.name).toEqual('SDKOutboundBulkResponseSentDmEvt');
        expect(sent._data.key).toEqual(bulkId);

        await backendEventHandler.stop();
    });
});

