import { describe, expect, it } from 'vitest';
import { collectStatus, formatStatus, maskAppId } from './status';
import type { AppConfig } from '../../config/schema';

describe('CLI status command', () => {
  const appId = 'cli_example_cdef';

  it('masks app ids', () => {
    expect(maskAppId(appId)).toBe('cli_…cdef');
    expect(maskAppId('short')).toBe('short');
  });

  it('reports complete config without exposing secrets', async () => {
    const cfg: AppConfig = {
      accounts: {
        app: {
          id: appId,
          secret: 'do-not-print',
          tenant: 'feishu',
        },
      },
    };

    const status = await collectStatus({
      appDir: '/tmp/bridge',
      configPath: '/tmp/bridge/config.json',
      loadConfig: async () => cfg,
      readProcesses: () => [{ id: 'a1b2' }, { id: 'c3d4' }],
      isCodexAvailable: async () => true,
    });

    const output = formatStatus(status);

    expect(output).toContain('config: complete');
    expect(output).toContain('app: feishu cli_…cdef');
    expect(output).toContain('running bots: 2');
    expect(output).toContain('gateway mode: adapter');
    expect(output).toContain('codex: available');
    expect(output).not.toContain('do-not-print');
  });

  it('reports channel relay mode explicitly when configured', async () => {
    const cfg: AppConfig = {
      accounts: {
        app: {
          id: appId,
          secret: 'do-not-print',
          tenant: 'feishu',
        },
      },
      preferences: {
        gatewayMode: 'relay',
      },
      runtimeServices: {
        artifact_namespace: 'tenant-alpha-artifacts',
        vector_tableName: 'tenant_alpha_vectors',
        record_namespace: 'tenant-alpha-records',
        record_tableName: 'tenant_alpha_records',
      },
    };

    const status = await collectStatus({
      appDir: '/tmp/bridge',
      configPath: '/tmp/bridge/config.json',
      loadConfig: async () => cfg,
      readProcesses: () => [],
      isCodexAvailable: async () => true,
    });

    expect(formatStatus(status)).toContain('gateway mode: relay');
    expect(formatStatus(status)).toContain('runtime services artifact namespace: tenant-alpha-artifacts');
    expect(formatStatus(status)).toContain('runtime services vector table: tenant_alpha_vectors');
    expect(formatStatus(status)).toContain('runtime services record namespace: tenant-alpha-records');
  });

  it('reports missing config and unavailable codex', async () => {
    const status = await collectStatus({
      appDir: '/tmp/bridge',
      configPath: '/tmp/bridge/config.json',
      loadConfig: async () => ({}),
      readProcesses: () => [],
      isCodexAvailable: async () => false,
    });

    expect(formatStatus(status)).toContain('config: incomplete');
    expect(formatStatus(status)).toContain('running bots: 0');
    expect(formatStatus(status)).toContain('codex: unavailable');
  });
});
