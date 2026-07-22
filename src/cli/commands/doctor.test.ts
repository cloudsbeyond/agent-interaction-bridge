import { describe, expect, test } from 'vitest';
import { runtimeResources } from '../../test/runtime-services-fixtures';
import type { CliStatus } from './status';
import { formatDoctorReport } from './doctor';

describe('doctor cli helpers', () => {
  test('summarizes local readiness without treating future compute stubs as failures', () => {
    const output = formatDoctorReport({
      status: completeStatus({ codexAvailable: true }),
      resources: runtimeResources([
        { id: 'model.language_completion', status: 'available', provider: 'runtime-language-provider:primary' },
        { id: 'model.image_generation', status: 'available', provider: 'runtime-vision-provider:primary' },
        { id: 'model.embedding', status: 'available', provider: 'runtime-embedding-provider:primary' },
        { id: 'storage.artifact_store', status: 'available', provider: 'runtime-artifact-store' },
        { id: 'storage.vector_index', status: 'available', provider: 'runtime-vector-store' },
        { id: 'storage.record_store', status: 'available', provider: 'runtime-record-store' },
        { id: 'compute.remote_agent_sandbox', kind: 'compute' },
      ]),
    });

    expect(output).toContain('Bridge doctor');
    expect(output).toContain('readiness: ok');
    expect(output).toContain('config: complete');
    expect(output).toContain('codex: available');
    expect(output).toContain('gateway mode: adapter');
    expect(output).toContain('future stubs: compute.remote_agent_sandbox');
  });

  test('marks bridge readiness as attention when local required resources are missing', () => {
    const output = formatDoctorReport({
      status: completeStatus({ codexAvailable: false }),
      resources: runtimeResources([
        { id: 'model.embedding' },
        { id: 'storage.vector_index', status: 'available', provider: 'runtime-vector-store' },
      ]),
    });

    expect(output).toContain('readiness: attention');
    expect(output).toContain('codex: unavailable');
    expect(output).toContain('missing runtime services resources:');
    expect(output).toContain('model.language_completion');
    expect(output).toContain('model.image_generation');
    expect(output).toContain('model.embedding');
    expect(output).toContain('storage.artifact_store');
    expect(output).toContain('storage.record_store');
    expect(output).not.toContain('secret');
  });

  test('reports Runtime Services unavailable without hiding the failure', () => {
    const output = formatDoctorReport({
      status: completeStatus({ codexAvailable: true }),
      resources: [],
      runtimeServicesIssue: [
        'Runtime Services unavailable',
        'reason: fetch failed: connect ECONNREFUSED 127.0.0.1:8765',
      ].join('\n'),
    });

    expect(output).toContain('readiness: attention');
    expect(output).toContain('runtime services: unavailable');
    expect(output).toContain('ECONNREFUSED');
    expect(output).toContain('missing runtime services resources: unavailable');
  });

  test('marks a registered bot without a fresh health snapshot as attention', () => {
    const output = formatDoctorReport({
      status: {
        ...completeStatus({ runningBots: 1 }),
        botHealth: [],
      } as unknown as CliStatus,
      resources: requiredResources(),
    });

    expect(output).toContain('readiness: attention');
    expect(output).toContain('connected bots: 0/1');
    expect(output).toContain('runtime health: missing');
  });

  test('reports runtime health as not running when no bot process exists', () => {
    const output = formatDoctorReport({
      status: completeStatus({ runningBots: 0, botHealth: [] }),
      resources: requiredResources(),
    });

    expect(output).toContain('connected bots: 0/0');
    expect(output).toContain('runtime health: not running');
    expect(output).not.toContain('runtime health: ok');
  });

  test('marks a reconnecting bot as attention even when config and dependencies are ready', () => {
    const output = formatDoctorReport({
      status: {
        ...completeStatus({ runningBots: 1 }),
        botHealth: [
          {
            processId: 'proc-1',
            state: 'reconnecting',
            updatedAt: '2026-07-22T06:00:00.000Z',
            fresh: true,
            issue: 'ws_reconnecting',
          },
        ],
      } as unknown as CliStatus,
      resources: requiredResources(),
    });

    expect(output).toContain('readiness: attention');
    expect(output).toContain('connected bots: 0/1');
    expect(output).toContain('proc-1: reconnecting');
    expect(output).toContain('ws_reconnecting');
  });
});

function requiredResources() {
  return runtimeResources([
    { id: 'model.language_completion', status: 'available', provider: 'runtime-language-provider:primary' },
    { id: 'model.image_generation', status: 'available', provider: 'runtime-vision-provider:primary' },
    { id: 'model.embedding', status: 'available', provider: 'runtime-embedding-provider:primary' },
    { id: 'storage.artifact_store', status: 'available', provider: 'runtime-artifact-store' },
    { id: 'storage.vector_index', status: 'available', provider: 'runtime-vector-store' },
    { id: 'storage.record_store', status: 'available', provider: 'runtime-record-store' },
  ]);
}

function completeStatus(overrides: Partial<CliStatus>): CliStatus {
  return {
    appDir: '/tmp/aib',
    configPath: '/tmp/aib/config.json',
    configComplete: true,
    runningBots: 0,
    botHealth: [],
    agentEndpoint: 'exec',
    gatewayMode: 'adapter',
    runtimeServices: {
      artifactNamespace: 'agent-interaction-bridge',
      vectorTableName: 'agent_interaction_bridge_vectors',
      recordNamespace: 'agent-interaction-bridge',
      recordTableName: 'agent_interaction_bridge_records',
    },
    runningAgentEndpoints: [],
    codexAvailable: true,
    ...overrides,
  };
}
