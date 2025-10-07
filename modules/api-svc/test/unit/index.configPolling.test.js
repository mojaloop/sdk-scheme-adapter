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
 * Eugen Klymniuk <eugen.klymniuk@infitx.com>

 --------------
 ******/

jest.mock('~/config');
jest.mock('~/lib/cache');
jest.mock('~/ControlAgent');

const promClient = require('prom-client');
const ControlAgent = require('~/ControlAgent');
const { Server } = require('~/index');
const { logger } = require('~/lib/logger');
const testConfig = require('./data/defaultConfig.json');

const POLL_INTERVAL_MS = 60_000;

describe('Config Polling Tests -->', () => {
    let server;
    let mockConfig;
    let mockControlAgent;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        promClient.register.clear(); // to prevent "metric already been registered" error

        mockConfig = {
            ...testConfig,
            pm4mlEnabled: true,
            control: {
                mgmtAPIWsUrl: 'localhost',
                mgmtAPIWsPort: 4005,
                mgmtAPILatencyAssumption: 2000,
                mgmtAPIPollIntervalMs: POLL_INTERVAL_MS,
            }
        };

        // Mock WebSocket client
        mockControlAgent = {
            getUpdatedConfig: jest.fn().mockResolvedValue({}),
            readyState: 1, // OPEN
            on: jest.fn(),
            once: jest.fn(),
            send: jest.fn(),
            receive: jest.fn(),
            stop: jest.fn().mockResolvedValue(true),
            removeAllListeners: jest.fn(),
        };

        ControlAgent.createConnectedControlAgentWs = jest.fn().mockResolvedValue(mockControlAgent);
    });

    afterEach(async () => {
        await server?.stop();
        jest.useRealTimers();
    });

    it('should not start polling when MANAGEMENT_API_POLL_INTERVAL_MS is not configured', async () => {
        const config = {
            ...mockConfig,
            control: {
                ...mockConfig.control,
                mgmtAPIPollIntervalMs: undefined,
            }
        };

        server = new Server(config, logger);
        await server.start();

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
        expect(mockControlAgent.getUpdatedConfig).not.toHaveBeenCalled();
    });

    it('should not start polling when PM4ML is disabled', async () => {
        const config = {
            ...mockConfig,
            pm4mlEnabled: false,
        };

        server = new Server(config, logger);
        await server.start();

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
        expect(ControlAgent.Client.Create).not.toHaveBeenCalled();
    });

    it('should poll at configured interval', async () => {
        server = new Server(mockConfig, logger);
        await server.start();
        expect(mockControlAgent.getUpdatedConfig).toHaveBeenCalledTimes(0);

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        expect(mockControlAgent.getUpdatedConfig).toHaveBeenCalledTimes(1); // First poll

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
        expect(mockControlAgent.getUpdatedConfig).toHaveBeenCalledTimes(2); // Second poll
    });

    it('should call restart with merged config from polling', async () => {
        const newJwsKey = 'new-jws-signing-key';
        mockControlAgent.getUpdatedConfig.mockResolvedValue({
            jwsSigningKey: newJwsKey
        });

        server = new Server(mockConfig, logger);
        const restartSpy = jest.spyOn(server, 'restart');

        await server.start();
        restartSpy.mockClear();


        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(restartSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                jwsSigningKey: newJwsKey
            }),
            { source: 'polling' }
        );
    });

    it('should handle unchanged config efficiently (no-op)', async () => {
        mockControlAgent.getUpdatedConfig.mockResolvedValue({});

        server = new Server(mockConfig, logger);
        const restartSpy = jest.spyOn(server, 'restart');
        await server.start();

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 10);
        expect(restartSpy).toHaveBeenCalledTimes(1); // ping timeout

        await jest.advanceTimersByTimeAsync(10);

        expect(restartSpy).toHaveBeenCalledTimes(2);
    });

    it('should prevent race condition when update already in progress', async () => {
        mockControlAgent.getUpdatedConfig.mockResolvedValue({ jwsSigningKey: 'new-key' });

        server = new Server(mockConfig, logger);
        await server.start();
        // Simulate restart in progress
        server._configUpdateInProgress = true;

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);

        expect(mockControlAgent.getUpdatedConfig).not.toHaveBeenCalled();
    });

    it('should skip polling when WebSocket not OPEN', async () => {
        server = new Server(mockConfig, logger);
        await server.start();

        mockControlAgent.getUpdatedConfig.mockClear();
        mockControlAgent.readyState = 0; // CONNECTING
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(mockControlAgent.getUpdatedConfig).not.toHaveBeenCalled();
    });

    describe('Error handling Tests -->', () => {
        it('should handle network errors gracefully during polling', async () => {
            mockControlAgent.getUpdatedConfig.mockRejectedValue(new Error('Connection refused'));

            server = new Server(mockConfig, logger);
            await server.start();
            await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

            // Error logged but polling continues - next poll should work
            mockControlAgent.getUpdatedConfig.mockResolvedValue({});
            await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

            expect(mockControlAgent.getUpdatedConfig).toHaveBeenCalledTimes(2); // failed + success calls
        });

        it('should handle missing config response', async () => {
            mockControlAgent.getUpdatedConfig.mockResolvedValue(null);

            server = new Server(mockConfig, logger);
            await server.start();
            await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

            // Should not crash, just log warning
            expect(server).toBeDefined();
        });
    });

    it('should stop polling when server stops', async () => {
        server = new Server(mockConfig, logger);
        await server.start();

        expect(server._configPollInterval).toBeDefined();
        await server.stop();
        expect(server._configPollInterval).toBeNull();

        mockControlAgent.getUpdatedConfig.mockClear();
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);

        expect(mockControlAgent.getUpdatedConfig).not.toHaveBeenCalled();
    });
});
