'use strict';

const SdkServer = require('../../src/SdkServer');
const { logger } = require('../../src/lib/logger');
const EventEmitter = require('node:events');

jest.mock('../../src/InboundServer');
jest.mock('../../src/OutboundServer');
jest.mock('../../src/OAuthTestServer');
jest.mock('../../src/BackendEventHandler');
jest.mock('../../src/FSPIOPEventHandler');
jest.mock('../../src/TestServer');
jest.mock('../../src/ControlAgent');
jest.mock('../../src/lib/cache');
jest.mock('../../src/lib/metrics', () => ({
  MetricsServer: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue()
  })),
  MetricsClient: jest.fn().mockImplementation(() => ({ }))
}));
jest.mock('../../src/lib/utils', () => ({
  createAuthClient: jest.fn()
}));

const InboundServer = require('../../src/InboundServer');
const OutboundServer = require('../../src/OutboundServer');
const OAuthTestServer = require('../../src/OAuthTestServer');
const { BackendEventHandler } = require('../../src/BackendEventHandler');
const { FSPIOPEventHandler } = require('../../src/FSPIOPEventHandler');
const TestServer = require('../../src/TestServer');
const ControlAgent = require('../../src/ControlAgent');
const Cache = require('../../src/lib/cache');
const utils = require('../../src/lib/utils');

describe('SdkServer', () => {
  let sdkServer;
  let mockConfig;
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCache = {
      connect: jest.fn().mockResolvedValue(),
      disconnect: jest.fn().mockResolvedValue()
    };
    Cache.mockImplementation(() => mockCache);

    mockConfig = {
      cacheUrl: 'redis://localhost:6379',
      enableTestFeatures: true,
      metrics: { port: 4004 },
      inbound: { port: 3000 },
      outbound: { port: 3001, maxSockets: 100, tls: { mutualTLS: { enabled: false } } },
      oidc: { enabled: false },
      oauthTestServer: { enabled: false, clientKey: 'key', clientSecret: 'secret', listenPort: 8080 },
      test: { port: 4000 },
      backendEventHandler: { enabled: false },
      fspiopEventHandler: { enabled: false },
      pm4mlEnabled: false,
      control: { mgmtAPIPollIntervalMs: null, mgmtAPILatencyAssumption: 5000 },
      peerJWSKeys: {},
      jwsSigningKey: null,
      requestProcessingTimeoutSeconds: 30
    };

    InboundServer.mockImplementation(() => {
      const server = new EventEmitter();
      server.start = jest.fn().mockResolvedValue();
      server.stop = jest.fn().mockResolvedValue();
      return server;
    });

    OutboundServer.mockImplementation(() => {
      const server = new EventEmitter();
      server.start = jest.fn().mockResolvedValue();
      server.stop = jest.fn().mockResolvedValue();
      return server;
    });

    OAuthTestServer.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue()
    }));

    BackendEventHandler.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue()
    }));

    FSPIOPEventHandler.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue()
    }));

    TestServer.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(),
      stop: jest.fn().mockResolvedValue()
    }));

    ControlAgent.createConnectedControlAgentWs = jest.fn().mockResolvedValue({
      on: jest.fn(),
      stop: jest.fn().mockResolvedValue(),
      readyState: 1,
      getUpdatedConfig: jest.fn().mockResolvedValue({})
    });

    const mockAuthEmitter = new EventEmitter();
    mockAuthEmitter.start = jest.fn().mockResolvedValue();
    mockAuthEmitter.stop = jest.fn().mockResolvedValue();

    utils.createAuthClient.mockReturnValue({
      auth: mockAuthEmitter,
      getToken: jest.fn().mockResolvedValue('mock-token'),
      clearCache: jest.fn()
    });

    sdkServer = new SdkServer(mockConfig, logger);
  });

  describe('constructor', () => {
    it('should emit error on OIDC auth error', () => {
      const errorHandler = jest.fn();
      sdkServer.on('error', errorHandler);
      
      const oidcError = new Error('OIDC auth error');
      sdkServer.oidc.auth.emit('error', oidcError);
      
      expect(errorHandler).toHaveBeenCalledWith('OIDC auth error in InboundApi', oidcError);
    });

    it('should create OAuthTestServer when enabled', () => {
      const configWithOAuth = {
        ...mockConfig,
        oauthTestServer: { enabled: true, clientKey: 'key', clientSecret: 'secret', listenPort: 8080 }
      };
      const server = new SdkServer(configWithOAuth, logger);
      expect(OAuthTestServer).toHaveBeenCalled();
      expect(server.oauthTestServer).toBeDefined();
    });

    it('should create BackendEventHandler when enabled', () => {
      const configWithBackend = {
        ...mockConfig,
        backendEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithBackend, logger);
      expect(BackendEventHandler).toHaveBeenCalled();
      expect(server.backendEventHandler).toBeDefined();
    });

    it('should create FSPIOPEventHandler when enabled', () => {
      const configWithFSPIOP = {
        ...mockConfig,
        fspiopEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithFSPIOP, logger);
      expect(FSPIOPEventHandler).toHaveBeenCalled();
      expect(server.fspiopEventHandler).toBeDefined();
    });
  });

  describe('_shouldUpdateInboundServer', () => {
    it('should return true when inbound config changes', () => {
      const newConfig = {
        ...mockConfig,
        inbound: { port: 3001 }
      };
      const result = sdkServer._shouldUpdateInboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return true when outbound config changes', () => {
      const newConfig = {
        ...mockConfig,
        outbound: { port: 3002, maxSockets: 200, tls: { mutualTLS: { enabled: false } } }
      };
      const result = sdkServer._shouldUpdateInboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return true when peerJWSKeys changes', () => {
      const newConfig = {
        ...mockConfig,
        peerJWSKeys: { key: 'value' }
      };
      const result = sdkServer._shouldUpdateInboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return true when jwsSigningKey changes', () => {
      const newConfig = {
        ...mockConfig,
        jwsSigningKey: 'new-key'
      };
      const result = sdkServer._shouldUpdateInboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return false when no relevant config changes', () => {
      const result = sdkServer._shouldUpdateInboundServer(mockConfig);
      expect(result).toBe(false);
    });
  });

  describe('_shouldUpdateOutboundServer', () => {
    it('should return true when outbound config changes', () => {
      const newConfig = {
        ...mockConfig,
        outbound: { port: 3002, maxSockets: 200, tls: { mutualTLS: { enabled: false } } }
      };
      const result = sdkServer._shouldUpdateOutboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return true when jwsSigningKey changes', () => {
      const newConfig = {
        ...mockConfig,
        jwsSigningKey: 'new-key'
      };
      const result = sdkServer._shouldUpdateOutboundServer(newConfig);
      expect(result).toBe(true);
    });

    it('should return false when no relevant config changes', () => {
      const result = sdkServer._shouldUpdateOutboundServer(mockConfig);
      expect(result).toBe(false);
    });
  });

  describe('_startConfigPolling', () => {
    it('should start polling when pm4mlEnabled and poll interval set', () => {
      const configWithPolling = {
        ...mockConfig,
        pm4mlEnabled: true,
        control: { mgmtAPIPollIntervalMs: 60000, mgmtAPILatencyAssumption: 5000 }
      };
      const server = new SdkServer(configWithPolling, logger);
      server.controlClient = { readyState: 1 };
      server._startConfigPolling();
      expect(server._configPollInterval).toBeDefined();
    });

    it('should not start polling when pm4mlEnabled is false', () => {
      sdkServer._startConfigPolling();
      expect(sdkServer._configPollInterval).toBeUndefined();
    });

    it('should not start polling when poll interval is not set', () => {
      const configNoInterval = {
        ...mockConfig,
        pm4mlEnabled: true,
        control: { mgmtAPIPollIntervalMs: null, mgmtAPILatencyAssumption: 5000 }
      };
      const server = new SdkServer(configNoInterval, logger);
      server._startConfigPolling();
      expect(server._configPollInterval).toBeUndefined();
    });
  });

  describe('_pollConfigFromMgmtAPI', () => {
    it('should skip polling when config update in progress', async () => {
      sdkServer._configUpdateInProgress = true;
      await sdkServer._pollConfigFromMgmtAPI();
    });

    it('should skip polling when control client not ready', async () => {
      sdkServer.controlClient = { readyState: 0 };
      await sdkServer._pollConfigFromMgmtAPI();
    });

    it('should handle error when polling fails', async () => {
      const configWithPolling = {
        ...mockConfig,
        pm4mlEnabled: true,
        control: { mgmtAPIPollIntervalMs: 60000, mgmtAPILatencyAssumption: 5000 }
      };
      const server = new SdkServer(configWithPolling, logger);
      server.controlClient = {
        readyState: 1,
        getUpdatedConfig: jest.fn().mockRejectedValue(new Error('Connection refused'))
      };
      server.restart = jest.fn().mockResolvedValue();
      
      await server._pollConfigFromMgmtAPI();
    });
  });

  describe('start', () => {
    it('should start all components when pm4mlEnabled is false', async () => {
      await sdkServer.start();
      expect(sdkServer.cache.connect).toHaveBeenCalled();
      expect(sdkServer.inboundServer.start).toHaveBeenCalled();
      expect(sdkServer.outboundServer.start).toHaveBeenCalled();
    });

    it('should create control client when pm4mlEnabled is true', async () => {
      const configWithPM4ML = {
        ...mockConfig,
        pm4mlEnabled: true,
        control: { mgmtAPIPollIntervalMs: 60000, mgmtAPILatencyAssumption: 5000 }
      };
      const server = new SdkServer(configWithPM4ML, logger);
      await server.start();
      expect(ControlAgent.createConnectedControlAgentWs).toHaveBeenCalled();
    });

    it('should start OAuthTestServer when enabled', async () => {
      const configWithOAuth = {
        ...mockConfig,
        oauthTestServer: { enabled: true, clientKey: 'key', clientSecret: 'secret', listenPort: 8080 }
      };
      const server = new SdkServer(configWithOAuth, logger);
      await server.start();
      expect(server.oauthTestServer.start).toHaveBeenCalled();
    });

    it('should start BackendEventHandler when enabled', async () => {
      const configWithBackend = {
        ...mockConfig,
        backendEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithBackend, logger);
      await server.start();
      expect(server.backendEventHandler.start).toHaveBeenCalled();
    });

    it('should start FSPIOPEventHandler when enabled', async () => {
      const configWithFSPIOP = {
        ...mockConfig,
        fspiopEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithFSPIOP, logger);
      await server.start();
      expect(server.fspiopEventHandler.start).toHaveBeenCalled();
    });

    it('should start TestServer when enableTestFeatures is true', async () => {
      await sdkServer.start();
      expect(sdkServer.testServer.start).toHaveBeenCalled();
    });
  });

  describe('restart', () => {
    it('should skip restart when config update in progress', async () => {
      sdkServer._configUpdateInProgress = true;
      await sdkServer.restart(mockConfig);
      expect(sdkServer.inboundServer.stop).not.toHaveBeenCalled();
    });

    it('should update cache when cacheUrl changes', async () => {
      const newConfig = {
        ...mockConfig,
        cacheUrl: 'redis://new-host:6379'
      };
      await sdkServer.restart(newConfig);
      expect(sdkServer.cache.disconnect).toHaveBeenCalled();
      expect(Cache).toHaveBeenCalled();
    });

    it('should update OIDC when oidc config changes', async () => {
      const newConfig = {
        ...mockConfig,
        oidc: { enabled: true, clientId: 'new-client' }
      };
      await sdkServer.restart(newConfig);
      expect(sdkServer.oidc).toBeDefined();
    });

    it('should update InboundServer when config changes', async () => {
      const newConfig = {
        ...mockConfig,
        inbound: { port: 3001 }
      };
      const previousInboundServer = sdkServer.inboundServer;
      await sdkServer.restart(newConfig);
      expect(previousInboundServer.stop).toHaveBeenCalled();
      expect(sdkServer.inboundServer.start).toHaveBeenCalled();
    });

    it('should update OutboundServer when config changes', async () => {
      const newConfig = {
        ...mockConfig,
        outbound: { port: 3002, maxSockets: 200, tls: { mutualTLS: { enabled: false } } }
      };
      const previousOutboundServer = sdkServer.outboundServer;
      await sdkServer.restart(newConfig);
      expect(previousOutboundServer.stop).toHaveBeenCalled();
      expect(sdkServer.outboundServer.start).toHaveBeenCalled();
    });

    it('should update FSPIOPEventHandler when outbound config changes and enabled', async () => {
      const configWithFSPIOP = {
        ...mockConfig,
        fspiopEventHandler: { enabled: true },
        outbound: { port: 3002, maxSockets: 200, tls: { mutualTLS: { enabled: false } } }
      };
      const server = new SdkServer(configWithFSPIOP, logger);
      const newConfig = {
        ...configWithFSPIOP,
        outbound: { port: 3003, maxSockets: 300, tls: { mutualTLS: { enabled: false } } }
      };
      await server.restart(newConfig);
      expect(server.fspiopEventHandler).toBeDefined();
    });

    it('should update OAuthTestServer when config changes', async () => {
      const configWithOAuth = {
        ...mockConfig,
        oauthTestServer: { enabled: true, clientKey: 'key', clientSecret: 'secret', listenPort: 8080 }
      };
      const server = new SdkServer(configWithOAuth, logger);
      const previousOAuthTestServer = server.oauthTestServer;
      const newConfig = {
        ...configWithOAuth,
        oauthTestServer: { enabled: true, clientKey: 'new-key', clientSecret: 'new-secret', listenPort: 8081 }
      };
      await server.restart(newConfig);
      expect(previousOAuthTestServer.stop).toHaveBeenCalled();
      expect(OAuthTestServer).toHaveBeenCalled();
    });

    it('should update TestServer when port changes', async () => {
      const newConfig = {
        ...mockConfig,
        test: { port: 4001 }
      };
      const previousTestServer = sdkServer.testServer;
      await sdkServer.restart(newConfig);
      expect(previousTestServer.stop).toHaveBeenCalled();
      expect(sdkServer.testServer.start).toHaveBeenCalled();
    });

    it('should handle error during restart', async () => {
      const newConfig = {
        ...mockConfig,
        inbound: { port: 3001 }
      };
      sdkServer.inboundServer.stop = jest.fn().mockRejectedValue(new Error('Stop failed'));
      await sdkServer.restart(newConfig);
      expect(sdkServer._configUpdateInProgress).toBe(false);
    });

    it('should update control client when control config changes', async () => {
      const configWithPM4ML = {
        ...mockConfig,
        pm4mlEnabled: true,
        control: { mgmtAPIPollIntervalMs: 60000, mgmtAPILatencyAssumption: 5000 }
      };
      const server = new SdkServer(configWithPM4ML, logger);
      const previousControlClient = {
        stop: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        readyState: 1
      };
      server.controlClient = previousControlClient;
      const newConfig = {
        ...configWithPM4ML,
        control: { mgmtAPIPollIntervalMs: 120000, mgmtAPILatencyAssumption: 10000 }
      };
      await server.restart(newConfig);
      expect(previousControlClient.stop).toHaveBeenCalled();
    });
  });

  describe('_createMojaloopSharedAgents', () => {
    it('should create shared agents with TLS creds when mTLS enabled', () => {
      const configWithMTLS = {
        ...mockConfig,
        outbound: {
          maxSockets: 100,
          tls: {
            mutualTLS: { enabled: true },
            creds: { key: 'key', cert: 'cert' }
          }
        }
      };
      const result = sdkServer._createMojaloopSharedAgents(configWithMTLS);
      expect(result.httpAgent).toBeDefined();
      expect(result.httpsAgent).toBeDefined();
    });

    it('should create shared agents without TLS creds when mTLS disabled', () => {
      const result = sdkServer._createMojaloopSharedAgents(mockConfig);
      expect(result.httpAgent).toBeDefined();
      expect(result.httpsAgent).toBeDefined();
      expect(result.httpsAgent.toJSON()).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop all components', async () => {
      await sdkServer.stop();
      expect(sdkServer.cache.disconnect).toHaveBeenCalled();
      expect(sdkServer.inboundServer.stop).toHaveBeenCalled();
      expect(sdkServer.outboundServer.stop).toHaveBeenCalled();
    });

    it('should stop OAuthTestServer when enabled', async () => {
      const configWithOAuth = {
        ...mockConfig,
        oauthTestServer: { enabled: true, clientKey: 'key', clientSecret: 'secret', listenPort: 8080 }
      };
      const server = new SdkServer(configWithOAuth, logger);
      await server.stop();
      expect(server.oauthTestServer.stop).toHaveBeenCalled();
    });

    it('should stop BackendEventHandler when enabled', async () => {
      const configWithBackend = {
        ...mockConfig,
        backendEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithBackend, logger);
      await server.stop();
      expect(server.backendEventHandler.stop).toHaveBeenCalled();
    });

    it('should stop FSPIOPEventHandler when enabled', async () => {
      const configWithFSPIOP = {
        ...mockConfig,
        fspiopEventHandler: { enabled: true }
      };
      const server = new SdkServer(configWithFSPIOP, logger);
      await server.stop();
      expect(server.fspiopEventHandler.stop).toHaveBeenCalled();
    });
  });
});
