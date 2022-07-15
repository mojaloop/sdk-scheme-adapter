/******************************************************************************
 *  Copyright 2019 ModusBox, Inc.                                             *
 *                                                                            *
 *  info@modusbox.com                                                         *
 *                                                                            *
 *  Licensed under the Apache License, Version 2.0 (the "License");           *
 *  you may not use this file except in compliance with the License.          *
 *  You may obtain a copy of the License at                                   *
 *  http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                            *
 *  Unless required by applicable law or agreed to in writing, software       *
 *  distributed under the License is distributed on an "AS IS" BASIS,         *
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 *  See the License for the specific language governing permissions and       *
 *  limitations under the License                                             *
 ******************************************************************************/

import { IKafkaEventConsumerOptions, IKafkaEventProducerOptions } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import Convict from 'convict';
import path from 'path';

export interface KafkaConfig {
    DOMAIN_EVENT_CONSUMER: IKafkaEventConsumerOptions;
    COMMAND_EVENT_PRODUCER: IKafkaEventProducerOptions;
}

// interface to represent service configuration
export interface ServiceConfig {
    LOG_LEVEL: LogLevel
    KAFKA: KafkaConfig
}
// Declare configuration schema, default values and bindings to environment variables
const config = Convict({
    LOG_LEVEL: {
        doc: 'Log level',
        format: ['trace','debug','info','warn','error','fatal'],
        default: 'info',
        env: 'LOG_LEVEL',
    },
    KAFKA: {
      DOMAIN_EVENT_CONSUMER: {
        brokerList: {
          doc: 'brokerList',
          format: String,
          default: 'localhost:9092',
          env: 'DOMAIN_EVENT_CONSUMER_BROKER_LIST',
        },
        groupId: {
          doc: 'groupId',
          format: String,
          default: 'domain_events_consumer_group',
          env: 'DOMAIN_EVENT_CONSUMER_GROUP_ID',
        },
        clientId: {
          doc: 'clientId',
          format: String,
          default: 'domain_events_consumer_client_id',
          env: 'DOMAIN_EVENT_CONSUMER_CLIENT_ID',
        },
        topics: {
          doc: 'topics',
          format: Array,
          default: ['topic-sdk-outbound-domain-events'],
          env: 'DOMAIN_EVENT_CONSUMER_TOPICS',
        }
      },
      COMMAND_EVENT_PRODUCER: {
        brokerList: {
          doc: 'brokerList',
          format: String,
          default: 'localhost:9092',
          env: 'COMMAND_EVENT_PRODUCER_BROKER_LIST',
        },
        clientId: {
          doc: 'clientId',
          format: String,
          default: 'command_events_producer_client_id',
          env: 'COMMAND_EVENT_PRODUCER_CLIENT_ID',
        },
        topic: {
          doc: 'topic',
          format: Array,
          default: 'topic-sdk-outbound-command-events',
          env: 'COMMAND_EVENT_PRODUCER_TOPIC',
        }
      }
    },
});

// Load configuration
config.loadFile<ServiceConfig>(path.join(__dirname, '/../../config/default.json'));

// Perform configuration validation
config.validate({ allowed: 'strict' });

export default config;
