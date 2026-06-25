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
});

function completeStatus(overrides: Partial<CliStatus>): CliStatus {
  return {
    appDir: '/tmp/aib',
    configPath: '/tmp/aib/config.json',
    configComplete: true,
    runningBots: 0,
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
