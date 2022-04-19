
const ControlServer = require('~/ControlServer');
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

describe('ControlServer', () => {
    it('exposes a valid message API', () => {
        expect(Object.keys(ControlServer.build).sort()).toEqual(
            Object.keys(ControlServer.MESSAGE).sort(),
            'The API exposed by the builder object must contain as top-level keys all of the message types exposed in the MESSAGE constant. Check that ControlServer.MESSAGE has the same keys as ControlServer.build.'
        );
        Object.entries(ControlServer.build).forEach(([messageType, builders]) => {
            expect(Object.keys(ControlServer.VERB)).toEqual(
                expect.arrayContaining(Object.keys(builders)),
                `For message type '${messageType}' every builder must correspond to a verb. Check that ControlServer.build.${messageType} has the same keys as ControlServer.VERB.`
            );
        });
        expect(Object.keys(ControlServer.build.ERROR.NOTIFY).sort()).toEqual(
            Object.keys(ControlServer.ERROR).sort(),
            'ControlServer.ERROR.NOTIFY should contain the same keys as ControlServer.ERROR'
        );
    });

    describe('API', () => {
        let server, logger, client;
        const appConfig = { what: 'ever' };
        const changedConfig = { ...appConfig, some: 'thing' };

        beforeEach(async () => {
            logger = new Logger.Logger({ stringify: () => '' });
            server = new ControlServer.Server({ logger, appConfig });
            client = await ControlServer.Client.Create({
                address: 'localhost',
                port: server.address().port,
                logger
            });
        });

        afterEach(async () => {
            await server.stop();
        });

        it('supplies config when requested', async () => {
            await client.send(ControlServer.build.CONFIGURATION.READ());
            const response = await client.receive();
            expect(response).toEqual({
                ...JSON.parse(ControlServer.build.CONFIGURATION.NOTIFY(appConfig, response.id)),
            });
        });

        it('emits new config when received', async () => {
            const newConfigEvent = new Promise(
                (resolve) => server.on(ControlServer.EVENT.RECONFIGURE, resolve)
            );
            await client.send(ControlServer.build.CONFIGURATION.PATCH(appConfig, changedConfig));
            const newConfEventData = await newConfigEvent;
            expect(newConfEventData).toEqual(changedConfig);
        });

        it('sends new config to clients when instructed', async () => {
            const client2 = await ControlServer.Client.Create({
                address: 'localhost',
                port: server.address().port,
                logger
            });
            const changedConfig = { ...appConfig, some: 'thing' };
            await client.send(ControlServer.build.CONFIGURATION.PATCH(appConfig, changedConfig));
            const restart = server.reconfigure({ appConfig: changedConfig });
            restart();
            await server.notifyClientsOfCurrentConfig();
            const [notification, notification2] =
                await Promise.all([client.receive(), client2.receive()]);
            const expected = ControlServer.build.CONFIGURATION.NOTIFY(changedConfig, notification.id);
            expect(JSON.stringify(notification)).toEqual(expected);
            expect(JSON.stringify(notification2)).toEqual(expected);
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

    test('ControlServer reconfigure method returns sync function', async () => {
        const server = new ControlServer.Server({ logger, appConfig: {} });
        const res = await server.reconfigure({ logger, appConfig: {} });
        expect(isPromise(res)).toEqual(false);
        await server.close();
    });
});
