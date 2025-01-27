

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

// TODO: Try to use the generic kafka producer from platform-shared-lib and investigate if there is any value in maintaining these classes here.

import { MLKafkaRawProducerOptions, MLKafkaRawProducerCompressionCodecs } from '@mojaloop/platform-shared-lib-nodejs-kafka-client-lib';
import { KafkaEventProducer } from './kafka_event_producer';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DomainEvent }  from '../events';
import { IMessage } from '@module-types';
import { IDomainEventProducer, IKafkaEventProducerOptions } from '../types';

export class KafkaDomainEventProducer extends KafkaEventProducer implements IDomainEventProducer {
    private _topic: string;

    constructor(
        producerOptions: IKafkaEventProducerOptions,
        logger: ILogger,
    ) {
        const mlProducerOptions: MLKafkaRawProducerOptions = {
            kafkaBrokerList: producerOptions.brokerList,
            producerClientId: producerOptions.clientId,
            skipAcknowledgements: true,
            messageMaxBytes: producerOptions.messageMaxBytes || 200000000,
            compressionCodec: producerOptions.compressionCodec || MLKafkaRawProducerCompressionCodecs.NONE,
        };
        super(mlProducerOptions, logger);
        this._topic = producerOptions.topic;
    }

    async sendDomainEvent(domainEventMessage: DomainEvent) {
        const message: IMessage = domainEventMessage.toIMessage(this._topic);
        await super.send(message);
    }

}
