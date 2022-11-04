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

// TODO: Try to use the generic kafka consumer from platform-shared-lib and investigate if there is any value in maintaining these classes here.

import { MLKafkaRawConsumerOptions, MLKafkaRawConsumerOutputType } from '@mojaloop/platform-shared-lib-nodejs-kafka-client-lib';
import { KafkaEventConsumer } from './kafka_event_consumer';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { DomainEvent }  from '../events';
import { IMessage } from '@module-types';
import { IKafkaEventConsumerOptions } from '../types';

export class KafkaDomainEventConsumer extends KafkaEventConsumer {

    constructor(
        handlerFn: (domainEventMessage: DomainEvent) => Promise<void>,
        consumerOptions: IKafkaEventConsumerOptions,
        logger: ILogger,
    ) {
        const superHandlerFn = async (message: IMessage) => {
            // Construct domain event message from IMessage
            const domainEventMessageObj = DomainEvent.CreateFromIMessage(message);
            // Call handler function with domain event message
            await handlerFn(domainEventMessageObj);
        };
        const mlConsumerOptions: MLKafkaRawConsumerOptions = {
            kafkaBrokerList: consumerOptions.brokerList,
            kafkaGroupId: consumerOptions.groupId,
            outputType: MLKafkaRawConsumerOutputType.Json,
            // TODO: Parameterize this
            messageMaxBytes: 200000000,
        };
        super(mlConsumerOptions, consumerOptions.topics, superHandlerFn, logger);
    }

}
