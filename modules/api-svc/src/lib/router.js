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

 * Modusbox
 - Matt Kingston <matt.kingston@modusbox.com>
 --------------
 ******/
'use strict';

const { Enum } = require('@mojaloop/central-services-shared');
const { ReturnCodes } = Enum.Http;

const router = (handlerMap) => async function routeHandling (ctx, next) {
    const handlers = handlerMap[ctx.state.path.pattern];
    const handler = handlers?.[ctx.method.toLowerCase()];

    if (!handler) {
        ctx.state.logger.isErrorEnabled && ctx.state.logger.error('No handler found');
        ctx.response.status = ReturnCodes.NOTFOUND.CODE;
        // TODO: response content according to API spec. Should probably actually be a 404 here.
        ctx.response.body = { statusCode: 404, message: 'Not found' };
    }
    else {
        await handler(ctx);
    }
    await next();
};

module.exports = (routes, config) => {
    if (!config?.multiDfsp) return router(routes);
    return router(Object.fromEntries(Object.entries(routes).map(([path, route]) => {
        return [`/{dfspId}${path}`, route];
    })));
};
