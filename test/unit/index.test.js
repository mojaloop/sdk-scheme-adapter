/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *       James Bush - james.bush@modusbox.com                             *
 **************************************************************************/

'use strict';

jest.mock('dotenv', () => ({
    config: jest.fn()
}));

const promClient = require('prom-client');
const defaultConfig = require('./data/defaultConfig.json');
const { Logger } = require('@mojaloop/sdk-standard-components');

const TestControlServer = require('./ControlServer');


process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_HOST = '172.17.0.2';
process.env.CACHE_PORT = '6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';

const index = require('~/index.js');

describe('index.js', () => {
    beforeEach(() => {
        promClient.register.clear();
    });

    test('Exports expected modules', () => {
        expect(typeof(index.Server)).toBe('function');
        expect(typeof(index.InboundServerMiddleware)).toBe('object');
        expect(typeof(index.OutboundServerMiddleware)).toBe('object');
        expect(typeof(index.Router)).toBe('function');
        expect(typeof(index.Validate)).toBe('function');
        expect(typeof(index.Cache)).toBe('function');
    });
});

describe('Server', () => {
    let server, controlServer, conf, logger;

    beforeEach(async () => {
        promClient.register.clear();
        logger = new Logger.Logger({ stringify: () => '' });
        conf = JSON.parse(JSON.stringify(defaultConfig));
        conf.enableTestFeatures = true;
        conf.pm4mlEnabled = true;
        conf.control.mgmtAPIWsUrl = 'localhost';
        conf.control.mgmtAPIWsPort = 4005;
        conf.control.port = conf.control.mgmtAPIWsPort;
        controlServer = new TestControlServer.Server({ logger, appConfig: conf });
        server = new index.Server(conf, logger);
        server.restart = jest.fn();
        await server.start();
    });

    afterEach(async () => {
        await controlServer.stop();
        await server.stop();
    });

    describe('is reconfigured correctly by the control client', () => {
        let newConf;
        beforeEach(async () => {
            // not every server restarts on every config change, we'll make sure they all restart
            newConf = { ...conf, logIndent: conf.logIndent + 1, control: { ...conf.control, rubbish: 'data' }, test: { trash: 'data' } };
            // Just in case, we'll assert the new configuration is different to the old one
            expect(newConf).not.toEqual(conf);
        });

        it('reconfigures and restarts constituent servers when triggered by control client', async () => {
            await controlServer.broadcastConfigChange(newConf);

            // We wait for the servers to get restarted
            await new Promise((wait) => setTimeout(wait, 1000));

            expect(server.restart).toHaveBeenCalledTimes(1);
            expect(server.restart).toHaveBeenCalledWith(newConf);
        });
    });
});
