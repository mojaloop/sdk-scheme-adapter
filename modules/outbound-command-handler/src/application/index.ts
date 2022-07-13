

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
 - Shashikant Hirugade <shashikant.hirugade@modusbox.com>
 - Vijay Kumar Guthi <vijaya.guthi@modusbox.com>
 --------------
 ******/

'use strict'

import { DefaultLogger } from "@mojaloop/logging-bc-client-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";

import { IRunHandler } from '@mojaloop/sdk-scheme-adapter-private-types-lib'
import { OutboundEventHandler } from './outbound_event_handler'

(async () => {
    // # setup application config
    // TODO: Use configuration library from typescript-template repo here
    const appConfig = {
      kafka: {
        host: (process.env.KAFKA_HOST != null) ? process.env.KAFKA_HOST : 'localhost:9092',
        autocommit: (process.env.KAFKA_AUTO_COMMIT === 'true'),
        autoCommitInterval: (process.env.KAFKA_AUTO_COMMIT_INTERVAL != null && !isNaN(Number(process.env.KAFKA_AUTO_COMMIT_INTERVAL)) && process.env.KAFKA_AUTO_COMMIT_INTERVAL?.trim()?.length > 0) ? Number.parseInt(process.env.KAFKA_AUTO_COMMIT_INTERVAL) : null,
        autoCommitThreshold: (process.env.KAFKA_AUTO_COMMIT_THRESHOLD != null && !isNaN(Number(process.env.KAFKA_AUTO_COMMIT_THRESHOLD)) && process.env.KAFKA_AUTO_COMMIT_THRESHOLD?.trim()?.length > 0) ? Number.parseInt(process.env.KAFKA_AUTO_COMMIT_THRESHOLD) : null,
        gzipCompression: (process.env.KAFKA_PRODUCER_GZIP === 'true'),
        fetchMinBytes: (process.env.KAFKA_FETCH_MIN_BYTES != null && !isNaN(Number(process.env.KAFKA_FETCH_MIN_BYTES)) && process.env.KAFKA_FETCH_MIN_BYTES?.trim()?.length > 0) ? Number.parseInt(process.env.KAFKA_FETCH_MIN_BYTES) : 1,
        fetchWaitMaxMs: (process.env.KAFKA_FETCH_WAIT_MAX_MS != null && !isNaN(Number(process.env.KAFKA_FETCH_WAIT_MAX_MS)) && process.env.KAFKA_FETCH_WAIT_MAX_MS?.trim()?.length > 0) ? Number.parseInt(process.env.KAFKA_FETCH_WAIT_MAX_MS) : 100
      }
    }

    // Instantiate logger
    const logger: ILogger = new DefaultLogger('bc', 'appName', 'appVersion'); //TODO: parameterize the names here

    logger.isDebugEnabled() && logger.debug(`appConfig=${JSON.stringify(appConfig)}`)

    // start outboundEventHandler
    const outboundEventHandler: IRunHandler = new OutboundEventHandler()
    try {
      await outboundEventHandler.start(appConfig, logger)
    } catch(err: any) {
      logger.isErrorEnabled() && logger.error(err, 'Error starting outbound event handler: ' + err.message)
      await outboundEventHandler.destroy()
    }

    // lets clean up all consumers here
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    const killProcess = async (): Promise<void> => {
      logger.isInfoEnabled() && logger.info('Exiting process...')
      logger.isInfoEnabled() && logger.info('Destroying handlers...')
      logger.isInfoEnabled() && logger.info('\tDestroying outboundEventHandler handler...')

      await outboundEventHandler.destroy()

      logger.isInfoEnabled() && logger.info('Exit complete!')
      process.exit(0)
    }
    /* eslint-disable-next-line @typescript-eslint/no-misused-promises */
    process.on('SIGINT', killProcess)
  })();
 