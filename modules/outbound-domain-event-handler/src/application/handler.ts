/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 * Modusbox
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict';

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import {
    IRunHandler,
    KafkaDomainEventConsumer,
    KafkaCommandEventProducer,
    IEventConsumer,
    DomainEvent,
    IKafkaEventConsumerOptions,
    IKafkaEventProducerOptions,
    ICommandEventProducer,
    SDKOutboundBulkRequestReceivedDmEvt,
    SDKOutboundBulkPartyInfoRequestedDmEvt,
    PartyInfoCallbackReceivedDmEvt,
    SDKOutboundBulkAcceptPartyInfoReceivedDmEvt,
    SDKOutboundBulkAcceptPartyInfoProcessedDmEvt,
    BulkQuotesCallbackReceivedDmEvt,
} from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IDomainEventHandlerOptions } from '../types';
import {
    handleSDKOutboundBulkPartyInfoRequested,
    handleSDKOutboundBulkRequestReceived,
    handlePartyInfoCallbackReceived,
    handleSDKOutboundBulkAcceptPartyInfoReceived,
    handleSDKOutboundBulkAcceptPartyInfoProcessed,
    handleBulkQuotesCallbackReceived,
} from './handlers';

export class OutboundEventHandler implements IRunHandler {
    private _logger: ILogger;

    private _consumer: IEventConsumer;

    private _commandProducer: ICommandEventProducer;

    private _domainEventHandlerOptions: IDomainEventHandlerOptions;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    async start(appConfig: any, logger: ILogger): Promise<void> {
        this._logger = logger;
        this._logger.info('start');

        const consumerOptions: IKafkaEventConsumerOptions = appConfig.get('KAFKA.DOMAIN_EVENT_CONSUMER');
        this._consumer = new KafkaDomainEventConsumer(this._messageHandler.bind(this), consumerOptions, logger);
        logger.info(`Created Message Consumer of type ${this._consumer.constructor.name}`);

        /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
        await this._consumer.init();
        await this._consumer.start();

        const producerOptions: IKafkaEventProducerOptions = appConfig.get('KAFKA.COMMAND_EVENT_PRODUCER');
        this._commandProducer = new KafkaCommandEventProducer(producerOptions, logger);
        logger.info(`Created Message Producer of type ${this._commandProducer.constructor.name}`);
        await this._commandProducer.init();

        // Create options for handlers
        this._domainEventHandlerOptions = {
            commandProducer: this._commandProducer,
        };
    }

    async destroy(): Promise<void> {
        await Promise.all([
            this._consumer?.destroy(),
            this._commandProducer?.destroy(),
        ]);
    }

    async _messageHandler(message: DomainEvent): Promise<void> {
        this._logger.info(`Got domain event message: ${message.getName()}`);
        // TODO: Handle errors validation here
        switch (message.getName()) {
            case SDKOutboundBulkRequestReceivedDmEvt.name: {
                await handleSDKOutboundBulkRequestReceived(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case SDKOutboundBulkPartyInfoRequestedDmEvt.name: {
                await handleSDKOutboundBulkPartyInfoRequested(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case PartyInfoCallbackReceivedDmEvt.name: {
                await handlePartyInfoCallbackReceived(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case SDKOutboundBulkAcceptPartyInfoReceivedDmEvt.name: {
                await handleSDKOutboundBulkAcceptPartyInfoReceived(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case SDKOutboundBulkAcceptPartyInfoProcessedDmEvt.name: {
                await handleSDKOutboundBulkAcceptPartyInfoProcessed(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case BulkQuotesCallbackReceivedDmEvt.name: {
                await handleBulkQuotesCallbackReceived(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            default: {
                this._logger.debug(`${message?.getName()}:${message?.getKey()} - Skipping unknown domain event`);
                return;
            }
        }
    }

}
