

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
 * Infitx
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

'use strict';

import { MLKafkaRawConsumer, MLKafkaRawConsumerOptions } from '@mojaloop/platform-shared-lib-nodejs-kafka-client-lib';
import { IMessage } from '@module-types';
import { IEventConsumer } from '../types';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';

export class KafkaEventConsumer implements IEventConsumer {
    private _kafkaConsumer: MLKafkaRawConsumer;

    private _kafkaTopics: string[];

    private _logger: ILogger;

    private _handler: (message: IMessage) => Promise<void>;

    constructor(
        consumerOptions: MLKafkaRawConsumerOptions,
        kafkaTopics: string[],
        handlerFn: (message: IMessage) => Promise<void>,
        logger: ILogger,
    ) {
        this._logger = logger;
        this._kafkaTopics = kafkaTopics;
        this._handler = handlerFn;
        this._kafkaConsumer = new MLKafkaRawConsumer(consumerOptions, this._logger);
    }

    async init(): Promise<void> {
        this._kafkaConsumer.setCallbackFn(this._handler);
        this._kafkaConsumer.setTopics(this._kafkaTopics);
        await this._kafkaConsumer.connect();
    }

    async start(): Promise<void> {
        await this._kafkaConsumer.start();
    }

    async destroy(): Promise<void> {
        await this._kafkaConsumer.destroy(false);
    }
}
