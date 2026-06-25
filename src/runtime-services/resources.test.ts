import { describe, expect, test } from 'vitest';
import {
  CANONICAL_RUNTIME_RESOURCE_IDS,
  RUNTIME_RESOURCE_IDS,
  hasAvailableRuntimeResource,
  modelResourceIds,
  storageResourceIds,
} from './resources';
import type { ResourceRequirement } from './types';

describe('Runtime Services resource descriptors', () => {
  test('recognizes the canonical language completion resource from resources.status', () => {
    const resources: ResourceRequirement[] = [
      resource({
        id: RUNTIME_RESOURCE_IDS.languageCompletion,
        kind: 'model',
        capability: 'generate typed text proposals through an operator-provided endpoint',
        purpose: 'Reusable language-model support for domain-agent and build-agent workflows without granting decision authority.',
        status: 'available',
      }),
    ];

    expect(hasAvailableRuntimeResource(resources, RUNTIME_RESOURCE_IDS.languageCompletion)).toBe(true);
  });

  test('lists only canonical model resources without aliases or duplicates', () => {
    expect(modelResourceIds()).toEqual([
      'model.language_completion',
      'model.embedding',
      'model.image_generation',
    ]);
    expect(new Set(modelResourceIds()).size).toBe(modelResourceIds().length);
  });

  test('tracks the full canonical resources.status catalog used by bridge checks', () => {
    expect(CANONICAL_RUNTIME_RESOURCE_IDS).toEqual([
      'model.language_completion',
      'model.image_generation',
      'model.embedding',
      'storage.artifact_store',
      'storage.vector_index',
      'storage.record_store',
      'compute.remote_agent_sandbox',
    ]);
    expect(storageResourceIds()).toEqual([
      'storage.artifact_store',
      'storage.vector_index',
      'storage.record_store',
    ]);
  });
});

function resource(input: {
  id: string;
  kind: ResourceRequirement['kind'];
  status: ResourceRequirement['status'];
  capability?: string;
  purpose?: string;
}): ResourceRequirement {
  return {
    id: input.id,
    kind: input.kind,
    capability: input.capability ?? input.id,
    purpose: input.purpose ?? 'test resource',
    status: input.status,
    operatorAction: 'configure runtime services',
  };
}
