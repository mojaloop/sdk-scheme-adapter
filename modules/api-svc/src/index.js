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
 - James Bush <jbush@mojaloop.io>

 --------------
 ******/
'use strict';

const { hostname } = require('node:os');
const { merge } = require('lodash');
const { name, version } = require('../../../package.json');

const SdkServer = require('./SdkServer');
const config = require('./config');
const ControlAgent = require('./ControlAgent');

// import things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
const InboundServerMiddleware = require('./InboundServer/middlewares.js');
const OutboundServerMiddleware = require('./OutboundServer/middlewares.js');
const Router = require('./lib/router');
const Validate = require('./lib/validate');
const Cache = require('./lib/cache');
const { SDKStateEnum } = require('./lib/model/common');
const { logger } = require('./lib/logger');

async function start(conf) {
    if (conf.pm4mlEnabled) {
        const controlClient = await ControlAgent.createConnectedControlAgentWs(conf, logger);
        const updatedConfigFromMgmtAPI = await controlClient.getUpdatedConfig();
        merge(conf, updatedConfigFromMgmtAPI);
        controlClient.terminate();
        // todo: - clarify, why do we need to terminate the client? (use .stop() method?)
        //       - can we use persistent ws controlClient from Server? (why do we need to establish a brand new ws connection here?)
    }

    const svr = new SdkServer(conf, logger);
    svr.on('error', (err) => {
        logger.error('Unhandled server error: ', err);
        process.exit(2);
    });

    // handle SIGTERM to exit gracefully
    process.on('SIGTERM', async () => {
        logger.info('SIGTERM received. Shutting down SDK...');
        await svr.stop();
        process.exit(0);
    });

    await svr.start().catch(err => {
        logger.error('Error starting server: ', err);
        process.exit(1);
    });

    logger.info('SDK server is started', { name, version, hostname: hostname() });
}

if (require.main === module) {
    // this module is main i.e. we were started as a server;
    // not used in unit test or "require" scenarios
    start(config);
}


// export things we want to expose e.g. for unit tests and users who dont want to use the entire
// scheme adapter as a service
module.exports = {
    Cache,
    ControlAgent,
    InboundServerMiddleware,
    OutboundServerMiddleware,
    Router,
    Server: SdkServer,
    Validate,
    SDKStateEnum,
    start,
    config,
};
