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

import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { Server } from 'http';
import { CreateExpressServer } from './app';
import path from 'path';
import { IBulkTransactionEntityRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';
import { Application } from 'express';


export interface IOutboundCommandEventHandlerAPIServerOptions {
    port: number;
    bulkTransactionEntityRepo: IBulkTransactionEntityRepo;
}

export class OutboundCommandEventHandlerAPIServer {
    private _logger: ILogger;

    private _port: number;

    private _serverInstance: Server;

    private _options: IOutboundCommandEventHandlerAPIServerOptions;

    private _app: Application;

    constructor(options: IOutboundCommandEventHandlerAPIServerOptions, logger: ILogger) {
        this._options = options;
        this._port = options.port;
        this._logger = logger.createChild(this.constructor.name);
    }

    async startServer(): Promise<Application> {
        if(this._app) {
            this._logger.warn('Server already exists!');
            return this._app;
        }

        return new Promise(async resolve => {
            this._app = await CreateExpressServer(
                path.join(__dirname, './interface/api.yaml'),
                {
                    bulkTransactionEntityRepo: this._options.bulkTransactionEntityRepo,
                    logger: this._logger,
                },
            );
            this._serverInstance = this._app.listen(this._port, () => {
                this._logger.info(`API Server is running on port ${this._port}`);
                resolve(this._app);
            });
        });
    }

    async stopServer() : Promise<void> {
        return new Promise(async resolve => {
            if(this._serverInstance) {
                this._serverInstance.closeAllConnections();
                this._serverInstance.on('close', ()=> {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public get server() {
        return this._app;
    }
}
