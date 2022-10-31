const { BackendEventHandler } = require('../../src/BackendEventHandler');
const { BackendRequests } = require('../../src/lib/model/lib/requests');
const { SDKStateEnum } = require('../../src/lib/model/common');
const { Logger } = require('@mojaloop/sdk-standard-components');
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

const logger = new Logger.Logger({ context: { app: 'BackendEventHandler' }, stringify: () => '' });

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

