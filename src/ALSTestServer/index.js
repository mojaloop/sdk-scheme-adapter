/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       Yevhen Kyriukha - yevhen.kyriukha@modusbox.com                   *
 **************************************************************************/

'use strict';

const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const { MojaloopRequests } = require('@mojaloop/sdk-standard-components');

const { Logger, Transports } = require('@internal/log');

const LOG_NAME = 'mojaloop-sdk-als-test-server';

/**
 * Account Lookup System test server
 * @returns {Promise}
 */
module.exports = (config) => {
    const space = Number(process.env.LOG_INDENT);
    const logger = new Logger({ context: { app: LOG_NAME }, space, transports: [Transports.consoleDir()] });

    const app = new Koa();
    const router = new Router();

    const requests = new MojaloopRequests({
        logger: logger,
        peerEndpoint: `127.0.0.1:${config.inboundPort}`,
        dfspId: 'test-als-endpoint',
        tls: config.tls,
        jwsSign: config.jwsSign,
        jwsSigningKey: config.jwsSigningKey,
    });

    const listenPort = config.alsTestServer.listenPort;

    const parser = bodyParser({
        detectJSON: (ctx) =>
            ctx.request.get('Content-Type').startsWith('application/vnd.interoperability.participants+json')
    });

    router.post('/participants', parser, (ctx) => {
        const body = ctx.request.body;

        const requestId = body.requestId;
        const fspSource = ctx.request.get('FSPIOP-Source');
        const response = {
            partyList: body.partyList.map(party => ({
                partyId: party,
                // errorInformation: null
            })),
            currency: body.currency,
        };

        ctx.status = 202;
        ctx.body = '';

        requests.putParticipantsALS(requestId, response, fspSource);
    });


    app.use(router.routes())
        .use(router.allowedMethods());

    app.listen(listenPort, () => logger.log(`Serving ALS Test Server on port ${listenPort}`));

    return new Promise((resolve, reject) => {
        app.on('error', err => {
            logger.error(err);
            reject(err);
        });
        app.on('close', () => resolve());
    });
};
