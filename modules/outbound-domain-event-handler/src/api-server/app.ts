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
 - Kevin Leyow <kevin.leyow@infitx.com>
 --------------
 ******/
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import Express, { Application } from 'express';
import addFormats from 'ajv-formats';
import OpenAPIBackend from 'openapi-backend';
import type { Request } from 'openapi-backend';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import Handlers from './handlers';
import { IBulkTransactionEntityReadOnlyRepo } from '@mojaloop/sdk-scheme-adapter-private-shared-lib';

export interface IAPIServerOptions {
    bulkTransactionEntityRepo: IBulkTransactionEntityReadOnlyRepo;
    logger: ILogger;
}

export enum AppServerPropertyEnum {
    bulkTransactionRepo = 'bulkTransactionRepo',
    logger = 'logger',
}

export const CreateExpressServer =
    async (
        openApiSpecFilePath: string,
        options: IAPIServerOptions,
    ): Promise<Application> => {
        const app: Application = Express();

        const swaggerSpec = YAML.load(openApiSpecFilePath);
        app.use(
            '/docs',
            swaggerUi.serve as any,
            swaggerUi.setup(undefined, {
                swaggerOptions: {
                    spec: swaggerSpec,
                },
            }) as any,
        );

        // API middle-wares
        // To parse Json in the payload
        app.use(Express.json());

        // Pass repo to context
        app.set(AppServerPropertyEnum.bulkTransactionRepo, options.bulkTransactionEntityRepo);
        app.set(AppServerPropertyEnum.logger, options.logger);

        // API routes based on the swagger file
        const api = new OpenAPIBackend({
            definition: openApiSpecFilePath,
            customizeAjv: ajv => addFormats(ajv),
            handlers: {
                ...Handlers,
                validationFail: async (c, _req: Express.Request, res: Express.Response) =>
                    res.status(400).json({ err: c.validation.errors }),
                notFound: async (_c, _req: Express.Request, res: Express.Response) => res.status(404).json({ err: 'not found' }),
            },
        });

        api.init();

        // Passing the openAPI object as express middle-ware
        app.use((req, res) => api.handleRequest(req as Request, req, res));

        return app;
    };
