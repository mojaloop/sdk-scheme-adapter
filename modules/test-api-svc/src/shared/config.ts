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

import Convict from 'convict';
import path from 'path';

export interface RedisConfig {
  CONNECTION_URL: string
  CLUSTERED_REDIS: boolean
}

// interface to represent service configuration
export interface ServiceConfig {
    PORT: number
    REDIS: RedisConfig
}

// Declare configuration schema, default values and bindings to environment variables
const config = Convict<ServiceConfig>({
    PORT: {
        doc: 'The port of the API server.',
        format: 'port',
        default: 8000,
        env: 'PORT',
    },
    REDIS: {
      CONNECTION_URL: {
        doc: 'The connection string of the redis server.',
        format: '*',
        default: 'redis://localhost:6379',
        env: 'REDIS_CONNECTION_URL',
      },
      CLUSTERED_REDIS: {
        doc: 'Whether redis server is clustered or not',
        format: 'Boolean',
        default: false,
        env: 'REDIS_CLUSTERED_REDIS',
      },
    }
});

// Load configuration
config.loadFile(path.join(__dirname, '/../../config/default.json'));

// Perform configuration validation
config.validate({ allowed: 'strict' });

export default config;
