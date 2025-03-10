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

 * Modusbox
 - Yevhen Kyriukha <yevhen.kyriukha@modusbox.com>
 --------------
 ******/
'use strict';

const { DefaultLogger } = require('@mojaloop/logging-bc-client-lib');
const {
    BC_CONFIG,
    KafkaDomainEventConsumer,
    KafkaDomainEventProducer,
    BulkTransfersRequestedDmEvt,
    PartyInfoRequestedDmEvt,
    BulkQuotesRequestedDmEvt,
} = require('@mojaloop/sdk-scheme-adapter-private-shared-lib');
const {
    handlePartyInfoRequestedDmEvt,
    handleBulkQuotesRequestedDmEvt,
    handleBulkTransfersRequestedDmEvt,
} = require('./handlers');

class FSPIOPEventHandler {
    constructor({ config, logger, cache, wso2 }) {
        this._conf = config;
        this._logger = logger.push({ component: this.constructor.name });
        this._cache = cache;
        this._wso2 = wso2;

        this._loggerFromLoggingBC = new DefaultLogger(BC_CONFIG.bcName, 'fspiop-event-handler', '0.0.1', config.logLevel);

    }

    async start() {
        const config = this._conf;
        this._logger.isInfoEnabled && this._logger.info('start');

        this._consumer = new KafkaDomainEventConsumer(this._messageHandler.bind(this), config.fspiopEventHandler.domainEventConsumer, this._loggerFromLoggingBC);
        this._logger.isInfoEnabled && this._logger.info(`Created Message Consumer of type ${this._consumer.constructor.name}`);

        this._producer = new KafkaDomainEventProducer(config.fspiopEventHandler.domainEventProducer, this._loggerFromLoggingBC);
        this._logger.isInfoEnabled && this._logger.info(`Created Message Producer of type ${this._producer.constructor.name}`);
        await this._producer.init();

        // Create options for handlers
        this._domainEventHandlerOptions = {
            producer: this._producer,
            consumer: this._consumer,
            cache: this._cache,
            wso2: this._wso2,
            config: this._conf,
        };

        await this._consumer.init();
        await this._consumer.start();
    }

    async stop() {
        this._logger.isInfoEnabled && this._logger.info('stop');
        await Promise.all([
            this._consumer?.destroy(),
            this._producer?.destroy(),
        ]);
    }

    async _messageHandler(message) {
        this._logger.isInfoEnabled && this._logger.info(`Got domain event message: ${message.getName()}`);
        // TODO: Handle errors validation here
        switch (message.getName()) {
            case PartyInfoRequestedDmEvt.name: {
                await handlePartyInfoRequestedDmEvt(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case BulkQuotesRequestedDmEvt.name: {
                await handleBulkQuotesRequestedDmEvt(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            case BulkTransfersRequestedDmEvt.name: {
                await handleBulkTransfersRequestedDmEvt(message, this._domainEventHandlerOptions, this._logger);
                break;
            }
            default: {
                this._logger.isDebugEnabled && this._logger.debug(`${message?.getName()}:${message?.getKey()} - Skipping unknown domain event`);
                return;
            }
        }
    }

}

module.exports = { FSPIOPEventHandler };
