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
import { IKafkaEventConsumerOptions, IKafkaEventProducerOptions } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { LogLevel } from '@mojaloop/logging-bc-public-types-lib';
import Convict from 'convict';
import path from 'path';

export interface KafkaConfig {
    DOMAIN_EVENT_CONSUMER: IKafkaEventConsumerOptions;
    COMMAND_EVENT_PRODUCER: IKafkaEventProducerOptions;
}

export interface RedisConfig {
    CONNECTION_URL: string
}

// interface to represent service configuration
export interface ServiceConfig {
    LOG_LEVEL: LogLevel
    API_SERVER: {
        ENABLED: boolean
        PORT: number
    }
    KAFKA: KafkaConfig
    REDIS: RedisConfig
}
// Declare configuration schema, default values and bindings to environment variables
const config = Convict({
    LOG_LEVEL: {
        doc: 'Log level',
        format: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
        default: 'info',
        env: 'LOG_LEVEL',
    },
    API_SERVER: {
        ENABLED: {
            doc: 'Whether to enable API server or not',
            format: 'Boolean',
            default: false,
            env: 'DOMAIN_EVENT_API_SERVER_ENABLED',
        },
        PORT: {
            doc: 'The port of the API server.',
            format: 'port',
            default: 8001,
            env: 'DOMAIN_EVENT_API_SERVER_PORT',
        },
    },
    REDIS: {
        CONNECTION_URL: {
            doc: 'The connection string of the redis server.',
            format: '*',
            default: 'redis://localhost:6379',
            env: 'REDIS_CONNECTION_URL',
        },
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
            },
            messageMaxBytes: {
                doc: 'messageMaxBytes',
                format: Number,
                default: 200000000,
                env: 'DOMAIN_EVENT_CONSUMER_MESSAGE_MAX_BYTES',
            },
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
                format: String,
                default: 'topic-sdk-outbound-command-events',
                env: 'COMMAND_EVENT_PRODUCER_TOPIC',
            },
            messageMaxBytes: {
                doc: 'messageMaxBytes',
                format: Number,
                default: 200000000,
                env: 'COMMAND_EVENT_PRODUCER_MESSAGE_MAX_BYTES',
            },
            compressionCodec: {
                doc: 'compressionCodec',
                format: String,
                default: 'none',
                env: 'COMMAND_EVENT_PRODUCER_COMPRESSION_CODEC',
            },
        },
    },
});

// Load configuration
config.loadFile<ServiceConfig>(path.join(__dirname, '/../../config/default.json'));

// Perform configuration validation
config.validate({ allowed: 'strict' });

export default config;
