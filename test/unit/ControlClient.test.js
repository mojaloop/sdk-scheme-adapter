
const ControlAgent = require('~/ControlAgent');
const TestControlServer = require('./ControlServer');
const { Logger } = require('@mojaloop/sdk-standard-components');

jest.mock('~/lib/cache');

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

        beforeEach(async () => {
            logger = new Logger.Logger({ stringify: () => '' });
            server = new TestControlServer.Server({ logger, appConfig });
            client = await ControlAgent.Client.Create({
                address: 'localhost',
                port: server.address().port,
                logger,
                appConfig
            });
        });

        afterEach(async () => {
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
