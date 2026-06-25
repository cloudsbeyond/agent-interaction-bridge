import type { ResourceKind, ResourceRequirement } from './types';

export const RUNTIME_RESOURCE_IDS = {
  languageCompletion: 'model.language_completion',
  imageGeneration: 'model.image_generation',
  embedding: 'model.embedding',
  artifactStore: 'storage.artifact_store',
  vectorIndex: 'storage.vector_index',
  recordStore: 'storage.record_store',
  remoteAgentSandbox: 'compute.remote_agent_sandbox',
} as const;

export type RuntimeResourceId = typeof RUNTIME_RESOURCE_IDS[keyof typeof RUNTIME_RESOURCE_IDS];

export const CANONICAL_RUNTIME_RESOURCE_IDS = [
  RUNTIME_RESOURCE_IDS.languageCompletion,
  RUNTIME_RESOURCE_IDS.imageGeneration,
  RUNTIME_RESOURCE_IDS.embedding,
  RUNTIME_RESOURCE_IDS.artifactStore,
  RUNTIME_RESOURCE_IDS.vectorIndex,
  RUNTIME_RESOURCE_IDS.recordStore,
  RUNTIME_RESOURCE_IDS.remoteAgentSandbox,
] as const;

export function modelResourceIds(): RuntimeResourceId[] {
  return [
    RUNTIME_RESOURCE_IDS.languageCompletion,
    RUNTIME_RESOURCE_IDS.embedding,
    RUNTIME_RESOURCE_IDS.imageGeneration,
  ];
}

export function storageResourceIds(): RuntimeResourceId[] {
  return [
    RUNTIME_RESOURCE_IDS.artifactStore,
    RUNTIME_RESOURCE_IDS.vectorIndex,
    RUNTIME_RESOURCE_IDS.recordStore,
  ];
}

export function localRequiredResourceIds(): RuntimeResourceId[] {
  return [
    RUNTIME_RESOURCE_IDS.languageCompletion,
    RUNTIME_RESOURCE_IDS.imageGeneration,
    RUNTIME_RESOURCE_IDS.embedding,
    RUNTIME_RESOURCE_IDS.artifactStore,
    RUNTIME_RESOURCE_IDS.vectorIndex,
    RUNTIME_RESOURCE_IDS.recordStore,
  ];
}

export function futureResourceIds(): RuntimeResourceId[] {
  return [RUNTIME_RESOURCE_IDS.remoteAgentSandbox];
}

export function hasAvailableRuntimeResource(
  resources: ResourceRequirement[],
  id: RuntimeResourceId,
): boolean {
  return resourceAvailable(findRuntimeResource(resources, id));
}

export function findRuntimeResource(
  resources: ResourceRequirement[],
  id: RuntimeResourceId,
): ResourceRequirement | undefined {
  return resources.find((resource) => resource.id === id);
}

export function resourceAvailable(resource: ResourceRequirement | undefined): boolean {
  return resource?.status === 'available';
}

export function missingRuntimeResource(id: RuntimeResourceId): ResourceRequirement {
  return {
    id,
    kind: runtimeResourceKind(id),
    capability: 'runtime services resource descriptor',
    purpose: 'Required by the bridge Runtime Services contract.',
    status: 'stubbed',
    operatorAction: `Runtime Services resources.status must return ${id}.`,
  };
}

export function runtimeResourceKind(id: RuntimeResourceId | string): ResourceKind {
  if (id.startsWith('model.')) return 'model';
  if (id.startsWith('storage.')) return 'storage';
  return 'compute';
}
