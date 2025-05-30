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

process.env.PEER_ENDPOINT = '172.17.0.3:4000';
process.env.BACKEND_ENDPOINT = '172.17.0.5:4000';
process.env.CACHE_URL = 'redis://172.17.0.2:6379';
process.env.MGMT_API_WS_URL = '0.0.0.0';
process.env.SUPPORTED_CURRENCIES='USD';

jest.mock('dotenv', () => ({
    config: jest.fn()
}));

const promClient = require('prom-client');
const index = require('~/index');
const { logger } = require('~/lib/logger');

const defaultConfig = require('./data/defaultConfig.json');
const TestControlServer = require('./ControlServer');

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
    let server, controlServer, conf;

    beforeEach(async () => {
        promClient.register.clear();
        conf = JSON.parse(JSON.stringify(defaultConfig));
        conf.enableTestFeatures = true;
        conf.pm4mlEnabled = true;
        conf.control.mgmtAPIWsUrl = 'localhost';
        conf.control.mgmtAPIWsPort = 4005;
        conf.control.port = conf.control.mgmtAPIWsPort;
        conf.control.mgmtAPILatencyAssumption = 2000;
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
            controlServer.broadcastConfigChange(newConf);

            // We wait for the servers to get restarted
            await new Promise((wait) => setTimeout(wait, 1000));

            expect(server.restart).toHaveBeenCalledTimes(1);
            expect(server.restart).toHaveBeenCalledWith(newConf);
        });

        it('restarts inbound server if peerJWSKeys config is different', async () => {
            // Clone the conf and change peerJWSKeys
            const newConf = JSON.parse(JSON.stringify(conf));
            newConf.peerJWSKeys = [{ kid: 'new-key', key: 'abc123' }];

            // _shouldUpdateInboundServer should return true
            expect(server._shouldUpdateInboundServer(newConf)).toBe(true);

            // Simulate a config change event from control server
            controlServer.broadcastConfigChange(newConf);

            // Wait for the restart to be triggered
            await new Promise((wait) => setTimeout(wait, 1000));

            expect(server.restart).toHaveBeenCalledTimes(1);
            expect(server.restart).toHaveBeenCalledWith(newConf);
        });

        it('restarts inbound server if inbound or outbound is different', async () => {
            // Clone the conf and change inbound config
            const newConfInbound = JSON.parse(JSON.stringify(conf));
            newConfInbound.inbound = { ...conf.inbound, newProp: 'value' };

            expect(server._shouldUpdateInboundServer(newConfInbound)).toBe(true);

            controlServer.broadcastConfigChange(newConfInbound);
            await new Promise((wait) => setTimeout(wait, 1000));
            expect(server.restart).toHaveBeenCalledWith(newConfInbound);

            // Reset mock
            server.restart.mockClear();

            // Clone the conf and change outbound config
            const newConfOutbound = JSON.parse(JSON.stringify(conf));
            newConfOutbound.outbound = { ...conf.outbound, anotherProp: 'value' };

            expect(server._shouldUpdateInboundServer(newConfOutbound)).toBe(true);

            controlServer.broadcastConfigChange(newConfOutbound);
            await new Promise((wait) => setTimeout(wait, 1000));
            expect(server.restart).toHaveBeenCalledWith(newConfOutbound);
        });
    });
});
