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

// TODO: Try to use the generic kafka consumer from platform-shared-lib and investigate if there is any value in maintaining these classes here.

import { MLKafkaRawConsumerOptions, MLKafkaRawConsumerOutputType } from '@mojaloop/platform-shared-lib-nodejs-kafka-client-lib';
import { KafkaEventConsumer } from './kafka_event_consumer';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { CommandEvent }  from '../events';
import { IMessage } from '@module-types';
import { IKafkaEventConsumerOptions } from '../types';

export class KafkaCommandEventConsumer extends KafkaEventConsumer {

    constructor(handlerFn: (
        commandEventMessage: CommandEvent) => Promise<void>,
    consumerOptions: IKafkaEventConsumerOptions,
    logger: ILogger,
    ) {
        const superHandlerFn = async (message: IMessage) => {
            // Construct command event message from IMessage
            const commandEventMessageObj = CommandEvent.CreateFromIMessage(message);
            // Call handler function with command event message
            await handlerFn(commandEventMessageObj);
        };
        const mlConsumerOptions: MLKafkaRawConsumerOptions = {
            kafkaBrokerList: consumerOptions.brokerList,
            kafkaGroupId: consumerOptions.groupId,
            outputType: MLKafkaRawConsumerOutputType.Json,
            messageMaxBytes: consumerOptions.messageMaxBytes || 200000000,
        };
        super(mlConsumerOptions, consumerOptions.topics, superHandlerFn, logger);
    }

}
