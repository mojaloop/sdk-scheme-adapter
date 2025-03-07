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

jest.mock('~/lib/cache');

const ControlAgent = require('~/ControlAgent');
const { createLogger } = require('~/lib/logger');
const TestControlServer = require('./ControlServer');

// TODO:
// - diff against master to determine what else needs testing
// - especially look for assertions in the code
// - err.. grep the code for TODO

describe('ControlAgent', () => {
    it('exposes a valid message API', () => {
        expect(Object.keys(ControlAgent.build).sort()).toEqual(
            Object.keys(ControlAgent.MESSAGE).sort(),
            'The API exposed by the builder object must contain as top-level keys all of the message types exposed in the MESSAGE constant. Check that ControlAgent.MESSAGE has the same keys as ControlAgent.build.'
        );
        Object.entries(ControlAgent.build).forEach(([messageType, builders]) => {
            expect(Object.keys(ControlAgent.VERB)).toEqual(
                expect.arrayContaining(Object.keys(builders)),
                `For message type '${messageType}' every builder must correspond to a verb. Check that ControlAgent.build.${messageType} has the same keys as ControlAgent.VERB.`
            );
        });
        expect(Object.keys(ControlAgent.build.ERROR.NOTIFY).sort()).toEqual(
            Object.keys(ControlAgent.ERROR).sort(),
            'ControlAgent.ERROR.NOTIFY should contain the same keys as ControlAgent.ERROR'
        );
    });

    describe('API', () => {
        let server, logger, client;
        const appConfig = { control: { port: 4005 }, what: 'ever' };
        const changedConfig = { ...appConfig, some: 'thing' };

        beforeAll(async () => {
            logger = createLogger({ stringify: () => '' });
            server = new TestControlServer.Server({ logger, appConfig });
            client = await ControlAgent.Client.Create({
                address: 'localhost',
                port: server.address().port,
                logger,
                appConfig
            });
        });

        afterAll(async () => {
            await client.stop();
            await server.stop();
        });

        it('receives config when requested', async () => {
            await client.send(ControlAgent.build.CONFIGURATION.READ());
            const response = await client.receive();
            expect(response).toEqual({
                ...JSON.parse(ControlAgent.build.CONFIGURATION.NOTIFY(appConfig, response.id)),
            });
        });

        it('emits new config when received', async () => {
            const newConfigEvent = new Promise(
                (resolve) => client.on(ControlAgent.EVENT.RECONFIGURE, resolve)
            );
            server.broadcastConfigChange(changedConfig);
            const newConfEventData = await newConfigEvent;
            expect(newConfEventData).toEqual(changedConfig);
        });
    });
});
