import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AgentAdapter } from '../../agent/types';
import type { AppConfig, AgentEndpointKind } from '../../config/schema';
import { paths } from '../../config/paths';
import type { Controls } from '../../commands';
import { readRuntimeHealth } from '../../runtime/health';
import { runStart } from './start';

const mocks = vi.hoisted(() => {
  const createAgentAdapter = vi.fn();
  const startChannel = vi.fn();
  const loadConfig = vi.fn();
  const register = vi.fn();
  const updateEntry = vi.fn();
  return {
    createAgentAdapter,
    startChannel,
    loadConfig,
    register,
    updateEntry,
    saveConfig: vi.fn(),
    buildEncryptedAccountConfig: vi.fn(),
    ensureSecretsGetterWrapper: vi.fn(),
    setSecret: vi.fn(),
    gcOldLogs: vi.fn(),
    gcMediaCache: vi.fn(),
    sameAppOthers: vi.fn(),
    unregisterSync: vi.fn(),
    cleanupTmpFiles: vi.fn(),
  };
});

vi.mock('../../agent/factory', () => ({
  createAgentAdapter: mocks.createAgentAdapter,
}));

vi.mock('../../bot/channel', () => ({
  startChannel: mocks.startChannel,
}));

vi.mock('../../bot/wizard', () => ({
  runRegistrationWizard: vi.fn(),
}));

vi.mock('../../config/store', () => ({
  loadConfig: mocks.loadConfig,
  saveConfig: mocks.saveConfig,
  buildEncryptedAccountConfig: mocks.buildEncryptedAccountConfig,
  ensureSecretsGetterWrapper: mocks.ensureSecretsGetterWrapper,
}));

vi.mock('../../config/keystore', () => ({
  setSecret: mocks.setSecret,
}));

vi.mock('../../core/logger', () => ({
  gcOldLogs: mocks.gcOldLogs,
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    fail: vi.fn(),
  },
}));

vi.mock('../../media/cache', () => ({
  gcMediaCache: mocks.gcMediaCache,
}));

vi.mock('../../runtime/registry', () => ({
  register: mocks.register,
  sameAppOthers: mocks.sameAppOthers,
  unregisterSync: mocks.unregisterSync,
  updateEntry: mocks.updateEntry,
  cleanupTmpFiles: mocks.cleanupTmpFiles,
}));

vi.mock('../../session/store', () => ({
  SessionStore: class {
    async load(): Promise<void> {}
  },
}));

vi.mock('../../workspace/store', () => ({
  WorkspaceStore: class {
    async load(): Promise<void> {}
  },
}));

describe('runStart restart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sameAppOthers.mockReturnValue([]);
    mocks.register.mockResolvedValue({
      id: 'proc-1',
      pid: process.pid,
      appId: 'cli_initial',
      tenant: 'feishu',
      configPath: '/tmp/bridge-config.json',
      startedAt: new Date().toISOString(),
      version: '0.1.0',
      agentEndpoint: 'exec',
    });
    mocks.updateEntry.mockResolvedValue(undefined);
    mocks.startChannel.mockImplementation(async (deps: { controls: Controls; agent: AgentAdapter }) => ({
      channel: { botIdentity: { name: `bot-${deps.agent.id}`, openId: 'ou_bot' } },
      disconnect: vi.fn(async () => {}),
    }));
    mocks.createAgentAdapter.mockImplementation((kind: AgentEndpointKind, options?: { appServerCwd?: string }) =>
      agent(kind, options?.appServerCwd),
    );
  });

  test('rebuilds the agent adapter from reloaded config on reconnect', async () => {
    mocks.loadConfig
      .mockResolvedValueOnce(config({ agentEndpoint: 'exec' }))
      .mockResolvedValueOnce(config({
        agentEndpoint: 'app-server',
        appServerCwd: '/tmp/codex-app-server-next',
      }));

    void runStart({ config: '/tmp/bridge-config.json' });

    await vi.waitFor(() => {
      expect(mocks.startChannel).toHaveBeenCalledTimes(1);
    });
    const controls = mocks.startChannel.mock.calls[0]?.[0].controls as Controls;

    await controls.restart();

    expect(mocks.createAgentAdapter).toHaveBeenNthCalledWith(1, 'exec', {
      appServerCwd: undefined,
    });
    expect(mocks.createAgentAdapter).toHaveBeenNthCalledWith(2, 'app-server', {
      appServerCwd: '/tmp/codex-app-server-next',
    });
    expect(mocks.startChannel.mock.calls[1]?.[0].agent.id).toBe(
      'agent_runtime.codex_app_server:/tmp/codex-app-server-next',
    );
    expect(mocks.updateEntry).toHaveBeenCalledWith(
      'proc-1',
      expect.objectContaining({ agentEndpoint: 'app-server' }),
    );
  });

  test('keeps the current bridge connected when the replacement endpoint is unavailable', async () => {
    const currentAgent = agent('exec');
    const unavailableAgent = agent('app-server', '/tmp/codex-app-server-next', false);
    mocks.createAgentAdapter
      .mockReturnValueOnce(currentAgent)
      .mockReturnValueOnce(unavailableAgent);
    mocks.loadConfig
      .mockResolvedValueOnce(config({ agentEndpoint: 'exec' }))
      .mockResolvedValueOnce(config({
        agentEndpoint: 'app-server',
        appServerCwd: '/tmp/codex-app-server-next',
      }));

    const currentBridge = bridgeFor(currentAgent);
    mocks.startChannel.mockResolvedValueOnce(currentBridge);

    void runStart({ config: '/tmp/bridge-config.json' });
    await vi.waitFor(() => expect(mocks.startChannel).toHaveBeenCalledTimes(1));
    const currentChannelDeps = mocks.startChannel.mock.calls[0]?.[0] as {
      controls: Controls;
      onHealth: (update: { state: 'connected' }) => Promise<void>;
    };
    const controls = currentChannelDeps.controls;
    await currentChannelDeps.onHealth({ state: 'connected' });

    await expect(controls.restart()).rejects.toThrow(
      'Codex endpoint unavailable after config reload: app-server',
    );

    expect(currentBridge.disconnect).not.toHaveBeenCalled();
    expect(mocks.startChannel).toHaveBeenCalledTimes(1);
    expect(await readRuntimeHealth(paths.appDir, 'proc-1')).toEqual(
      expect.objectContaining({
        endpoint: 'exec',
        endpointAvailable: true,
        state: 'connected',
      }),
    );
  });

  test('restores the previous bridge when replacement channel startup fails', async () => {
    const currentAgent = agent('exec');
    const nextAgent = agent('app-server', '/tmp/codex-app-server-next');
    mocks.createAgentAdapter
      .mockReturnValueOnce(currentAgent)
      .mockReturnValueOnce(nextAgent);
    const currentConfig = config({ agentEndpoint: 'exec' });
    mocks.loadConfig
      .mockResolvedValueOnce(currentConfig)
      .mockResolvedValueOnce(config({
        agentEndpoint: 'app-server',
        appServerCwd: '/tmp/codex-app-server-next',
      }));

    const currentBridge = bridgeFor(currentAgent);
    const restoredBridge = bridgeFor(currentAgent);
    mocks.startChannel
      .mockResolvedValueOnce(currentBridge)
      .mockRejectedValueOnce(new Error('replacement handshake failed'))
      .mockResolvedValueOnce(restoredBridge);

    void runStart({ config: '/tmp/bridge-config.json' });
    await vi.waitFor(() => expect(mocks.startChannel).toHaveBeenCalledTimes(1));
    const controls = mocks.startChannel.mock.calls[0]?.[0].controls as Controls;

    await expect(controls.restart()).rejects.toThrow('replacement handshake failed');

    expect(currentBridge.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.startChannel).toHaveBeenCalledTimes(3);
    expect(mocks.startChannel.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ cfg: currentConfig, agent: currentAgent }),
    );
    expect(controls.cfg).toBe(currentConfig);
  });

  test('terminates for LaunchAgent recovery when replacement and rollback both fail', async () => {
    const currentAgent = agent('exec');
    const nextAgent = agent('app-server', '/tmp/codex-app-server-next');
    mocks.createAgentAdapter
      .mockReturnValueOnce(currentAgent)
      .mockReturnValueOnce(nextAgent);
    mocks.loadConfig
      .mockResolvedValueOnce(config({ agentEndpoint: 'exec' }))
      .mockResolvedValueOnce(config({
        agentEndpoint: 'app-server',
        appServerCwd: '/tmp/codex-app-server-next',
      }));

    mocks.startChannel
      .mockResolvedValueOnce(bridgeFor(currentAgent))
      .mockRejectedValueOnce(new Error('replacement handshake failed'))
      .mockRejectedValueOnce(new Error('rollback handshake failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 'none'}`);
    }) as never);

    try {
      void runStart({ config: '/tmp/bridge-config.json' });
      await vi.waitFor(() => expect(mocks.startChannel).toHaveBeenCalledTimes(1));
      const controls = mocks.startChannel.mock.calls[0]?.[0].controls as Controls;

      await expect(controls.restart()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      exit.mockRestore();
    }
  });
});

function config(preferences: NonNullable<AppConfig['preferences']>): AppConfig {
  return {
    accounts: {
      app: {
        id: 'cli_initial',
        secret: '${APP_SECRET}',
        tenant: 'feishu',
      },
    },
    preferences,
  } as AppConfig;
}

function agent(kind: AgentEndpointKind, appServerCwd?: string, available = true): AgentAdapter {
  return {
    id: kind === 'app-server'
      ? `agent_runtime.codex_app_server:${appServerCwd ?? 'default'}`
      : 'agent_runtime.codex_cli',
    displayName: kind,
    isAvailable: vi.fn(async () => available),
    run: vi.fn(),
  } as unknown as AgentAdapter;
}

function bridgeFor(value: AgentAdapter): {
  channel: { botIdentity: { name: string; openId: string } };
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    channel: { botIdentity: { name: `bot-${value.id}`, openId: 'ou_bot' } },
    disconnect: vi.fn(async () => {}),
  };
}
