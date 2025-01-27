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
 * Infitx
 - Shashikant Hirugade <shashikant.hirugade@mojaloop.io>
 - Vijay Kumar Guthi <vijaya.guthi@infitx.com>
 --------------
 ******/

'use strict';

import { DefaultLogger } from '@mojaloop/logging-bc-client-lib';
import { ILogger, LogLevel } from '@mojaloop/logging-bc-public-types-lib';

import { IRunHandler, BC_CONFIG, IRedisBulkTransactionStateRepoOptions, RedisBulkTransactionStateRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { IOutboundEventHandlerOptions, OutboundEventHandler } from './handler';
import { IOutboundCommandEventHandlerAPIServerOptions, OutboundCommandEventHandlerAPIServer } from '../api-server';
import Config from '../shared/config';

(async () => {
    // Instantiate logger
    const logger: ILogger = new DefaultLogger(BC_CONFIG.bcName, 'command-event-handler', '0.0.1', <LogLevel>Config.get('LOG_LEVEL'));

    // Create bulk transaction entity repo
    const bulkTransactionEntityRepoOptions: IRedisBulkTransactionStateRepoOptions = {
        connStr: Config.get('REDIS.CONNECTION_URL'),
    };

    const bulkTransactionEntityRepo = new RedisBulkTransactionStateRepo(bulkTransactionEntityRepoOptions, logger);
    logger.info(`Created BulkTransactionStateRepo of type ${bulkTransactionEntityRepo.constructor.name}`);
    await bulkTransactionEntityRepo.init();

    // start outboundEventHandler
    const outboundEventHandlerOptions: IOutboundEventHandlerOptions = {
        bulkTransactionEntityRepo,
    };
    const outboundEventHandler: IRunHandler = new OutboundEventHandler(outboundEventHandlerOptions);
    try {
        await outboundEventHandler.start(Config, logger);
    } catch (err) {
        logger.error(err, 'Error starting outbound event handler: ' + (err as Error).message);
        await outboundEventHandler.destroy();
    }

    // API Server
    const outboundCommandEventHandlerAPIServerOptions: IOutboundCommandEventHandlerAPIServerOptions = {
        port: Config.get('API_SERVER.PORT'),
        bulkTransactionEntityRepo,
    };
    const apiServer = new OutboundCommandEventHandlerAPIServer(outboundCommandEventHandlerAPIServerOptions, logger);
    if(Config.get('API_SERVER.ENABLED')) {
        logger.info('Starting API Server...');
        await apiServer.startServer();
    }
    // lets clean up all consumers here
    const killProcess = async (): Promise<void> => {
        logger.info('Exiting process...');
        logger.info('Destroying handlers...');
        logger.info('\tDestroying outboundEventHandler handler...');

        await outboundEventHandler.destroy();
        await bulkTransactionEntityRepo?.destroy();
        await apiServer.stopServer();

        logger.info('Exit complete!');
        process.exit(0);
    };
    process.on('SIGINT', killProcess);
})();
