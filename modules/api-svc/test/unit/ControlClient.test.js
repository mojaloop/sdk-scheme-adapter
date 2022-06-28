
const ControlAgent = require('~/ControlAgent');
const TestControlServer = require('./ControlServer');
const InboundServer = require('~/InboundServer');
const OutboundServer = require('~/OutboundServer');
const TestServer = require('~/TestServer');
const defaultConfig = require('./data/defaultConfig.json');
const { Logger } = require('@mojaloop/sdk-standard-components');

jest.mock('~/lib/cache');
const Cache = require('~/lib/cache');

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
            await server.broadcastConfigChange(changedConfig);
            const newConfEventData = await newConfigEvent;
            expect(newConfEventData).toEqual(changedConfig);
        });
    });
});

describe('Server reconfigure methods', () => {
    let conf, logger, cache;

    const isPromise = (o) => Promise.resolve(o) === o;

    beforeEach(() => {
        conf = JSON.parse(JSON.stringify(defaultConfig));
        logger = new Logger.Logger({ stringify: () => '' });
        cache = new Cache({ ...conf.cacheConfig, logger: logger.push({ component: 'cache' }) });
    });

    test('InboundServer reconfigure method returns sync function', async () => {
        const server = new InboundServer(conf, logger, cache);
        const res = await server.reconfigure(conf, logger, cache);
        expect(isPromise(res)).toEqual(false);
    });

    test('OutboundServer reconfigure method returns sync function', async () => {
        const server = new OutboundServer(conf, logger, cache);
        const res = await server.reconfigure(conf, logger, cache);
        expect(isPromise(res)).toEqual(false);
    });

    test('TestServer reconfigure method returns sync function', async () => {
        const server = new TestServer({ logger, cache });
        const res = await server.reconfigure({ logger, cache });
        expect(isPromise(res)).toEqual(false);
    });

    test('ControlClient reconfigure method returns sync function', async () => {
        const server = new TestControlServer.Server({ logger, appConfig: { ...conf, control: { port: 4005 }}});
        const client = await ControlAgent.Client.Create({ port: 4005, logger, appConfig: {} });
        const res = await client.reconfigure({ logger, port: 4005, appConfig: {} });
        expect(isPromise(res)).toEqual(false);
        await client.close();
        await server.close();
    });
});
