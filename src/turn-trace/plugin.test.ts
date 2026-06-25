import { describe, expect, test, vi } from 'vitest';
import type { RuntimeServicesPort } from '../runtime-services/port';
import { RUNTIME_RESOURCE_IDS } from '../runtime-services/resources';
import type { ResourceRequirement } from '../runtime-services/types';
import { createTurnTraceRecorder } from './plugin';

describe('turn trace plugin', () => {
  test('skips Runtime Services writes when disabled', async () => {
    const runtime = runtimePort();
    const recorder = createTurnTraceRecorder({
      enabled: false,
      scope: 'oc_123',
      chatId: 'oc_123',
      previousArtifactId: 'artifact-prev',
      runtime,
      resources: [resource(RUNTIME_RESOURCE_IDS.artifactStore, 'available')],
      artifactNamespace: 'bridge-turn-traces',
    });

    recorder.record('gateway_resolved', { gatewayMode: 'relay' });
    const result = await recorder.flush();

    expect(result).toEqual({ status: 'disabled' });
    expect(runtime.call).not.toHaveBeenCalled();
  });

  test('skips writes when Runtime Services artifact storage is not ready', async () => {
    const runtime = runtimePort();
    const recorder = createTurnTraceRecorder({
      enabled: true,
      scope: 'oc_123',
      chatId: 'oc_123',
      previousArtifactId: 'artifact-prev',
      runtime,
      resources: [resource(RUNTIME_RESOURCE_IDS.artifactStore, 'stubbed')],
      artifactNamespace: 'bridge-turn-traces',
    });

    recorder.record('gateway_resolved', { gatewayMode: 'adapter' });
    const result = await recorder.flush();

    expect(result).toEqual({ status: 'missing_resource' });
    expect(runtime.call).not.toHaveBeenCalled();
  });

  test('stores a chained JSONL turn trace artifact', async () => {
    const runtime = runtimePort('artifact-next');
    const recorder = createTurnTraceRecorder({
      enabled: true,
      scope: 'oc_123',
      chatId: 'oc_123',
      previousArtifactId: 'artifact-prev',
      runtime,
      resources: [resource(RUNTIME_RESOURCE_IDS.artifactStore, 'available')],
      artifactNamespace: 'bridge-turn-traces',
    });

    recorder.record('gateway_resolved', { requestedGatewayMode: 'adapter', gatewayMode: 'relay' });
    recorder.record('run_finished', { terminal: 'done', finalText: 'ok' });
    const result = await recorder.flush();

    expect(result).toMatchObject({ status: 'stored', artifactId: 'artifact-next' });
    expect(runtime.call).toHaveBeenCalledWith(
      'artifact.save',
      expect.objectContaining({
        namespace: 'bridge-turn-traces',
        mimeType: 'application/jsonl',
        extension: 'jsonl',
        source: expect.objectContaining({
          kind: 'turn_trace',
          previousArtifactId: 'artifact-prev',
          scope: 'oc_123',
        }),
      }),
      { consumer: 'domain-agent', purpose: 'persist bridge turn trace' },
    );
    const input = runtime.call.mock.calls[0]?.[1] as { body: string };
    const lines = input.body.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({
      type: 'turn_trace',
      schema: 'agent-interaction-bridge.turn-trace.v1',
      scope: 'oc_123',
      previousArtifactId: 'artifact-prev',
    });
    expect(lines[1]).toMatchObject({
      type: 'stage',
      stage: 'gateway_resolved',
      data: { requestedGatewayMode: 'adapter', gatewayMode: 'relay' },
    });
    expect(lines[2]).toMatchObject({
      type: 'stage',
      stage: 'run_finished',
      data: { terminal: 'done', finalText: 'ok' },
    });
  });
});

function runtimePort(artifactId = 'artifact-1'): RuntimeServicesPort & {
  call: ReturnType<typeof vi.fn>;
} {
  return {
    describe: vi.fn(async () => ({ schemaVersion: 1, capabilities: [] })),
    call: vi.fn(async () => ({
      status: 'ok',
      capabilityId: 'artifact.save',
      providerId: 'runtime-artifact-store',
      modelId: 'none',
      evidence: [],
      artifact: {
        id: artifactId,
        namespace: 'bridge-turn-traces',
        path: `/tmp/${artifactId}.jsonl`,
        mimeType: 'application/jsonl',
        sizeBytes: 1,
        sha256: 'sha',
        createdAt: new Date(0).toISOString(),
        source: {},
      },
    })),
  } as RuntimeServicesPort & { call: ReturnType<typeof vi.fn> };
}

function resource(id: string, status: ResourceRequirement['status']): ResourceRequirement {
  return {
    id,
    kind: 'storage',
    capability: id,
    purpose: 'test resource',
    status,
    operatorAction: 'configure runtime services',
  };
}
