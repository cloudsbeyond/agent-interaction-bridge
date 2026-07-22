import { describe, expect, test, vi } from 'vitest';
import type { RuntimeHealthView } from './health';
import type { ProcessEntry } from './registry';
import { waitForLaunchAgentReadiness } from './service-readiness';

describe('LaunchAgent service readiness', () => {
  test('waits for launchd, a process from this start, and connected endpoint health', async () => {
    let now = 1_000;
    let poll = 0;
    const oldProcess = processEntry('old', 900);
    const freshProcess = processEntry('fresh', 1_000);
    const readHealth = vi.fn(async (): Promise<RuntimeHealthView | undefined> => {
      if (poll < 3) return health('fresh', 'starting', false);
      return health('fresh', 'connected', true);
    });

    const result = await waitForLaunchAgentReadiness({
      startedAfter: 1_000,
      timeoutMs: 5_000,
      pollMs: 100,
      appDir: '/tmp/aib',
      logPath: '/tmp/aib/logs/launchd.log',
      now: () => now,
      wait: async (ms) => {
        now += ms;
        poll += 1;
      },
      status: async () => poll === 0 ? 'not loaded' : 'state = running',
      readProcesses: () => poll < 2 ? [oldProcess] : [oldProcess, freshProcess],
      readHealth,
    });

    expect(result.process.id).toBe('fresh');
    expect(result.health).toEqual(expect.objectContaining({
      state: 'connected',
      endpointAvailable: true,
      fresh: true,
    }));
    expect(poll).toBe(3);
  });

  test('does not accept stale or endpoint-unavailable health', async () => {
    let now = 2_000;
    let poll = 0;
    const freshProcess = processEntry('fresh', 2_000);

    const result = await waitForLaunchAgentReadiness({
      startedAfter: 2_000,
      timeoutMs: 1_000,
      pollMs: 50,
      now: () => now,
      wait: async (ms) => {
        now += ms;
        poll += 1;
      },
      status: async () => 'state = running',
      readProcesses: () => [freshProcess],
      readHealth: async () => poll === 0
        ? { ...health('fresh', 'connected', true), fresh: false }
        : poll === 1
          ? health('fresh', 'connected', false)
          : health('fresh', 'connected', true),
    });

    expect(result.process.id).toBe('fresh');
    expect(poll).toBe(2);
  });

  test('reports the last observed state and launchd log on timeout', async () => {
    let now = 3_000;
    const freshProcess = processEntry('fresh', 3_000);

    await expect(waitForLaunchAgentReadiness({
      startedAfter: 3_000,
      timeoutMs: 200,
      pollMs: 100,
      appDir: '/tmp/aib',
      logPath: '/tmp/aib/logs/launchd.log',
      now: () => now,
      wait: async (ms) => { now += ms; },
      status: async () => 'state = running',
      readProcesses: () => [freshProcess],
      readHealth: async () => health('fresh', 'reconnecting', true),
    })).rejects.toThrow(
      /LaunchAgent readiness timed out.*launchd=running.*process=fresh.*health=reconnecting.*\/tmp\/aib\/logs\/launchd\.log/s,
    );
  });
});

function processEntry(id: string, startedAt: number): ProcessEntry {
  return {
    id,
    pid: 123,
    appId: 'cli_test',
    tenant: 'feishu',
    configPath: '/tmp/aib/config.json',
    startedAt: new Date(startedAt).toISOString(),
    version: '0.1.0',
    agentEndpoint: 'app-server',
  };
}

function health(
  processId: string,
  state: RuntimeHealthView['state'],
  endpointAvailable: boolean,
): RuntimeHealthView {
  return {
    schemaVersion: 1,
    processId,
    pid: 123,
    endpoint: 'app-server',
    endpointAvailable,
    state,
    updatedAt: new Date(3_000).toISOString(),
    fresh: true,
  };
}
