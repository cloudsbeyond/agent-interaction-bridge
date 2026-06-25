import type {
  ArtifactCleanupOutput,
  ArtifactListOutput,
  EmbeddingCreateOutput,
  ResourceRequirement,
  StoredArtifact,
  VectorSearchOutput,
  VectorSearchResult,
  VectorUpsertOutput,
} from '../../runtime-services/types';
import type { RuntimeServicesPort } from '../../runtime-services/port';
import {
  findRuntimeResource,
  RUNTIME_RESOURCE_IDS,
} from '../../runtime-services/resources';
import { createRuntimeServicesPortContext } from '../../runtime-services/selector';
import {
  getRuntimeServicesArtifactNamespace,
  getRuntimeServicesVectorTableName,
  type AppConfig,
} from '../../config/schema';
import { loadConfig } from '../../config/store';
import {
  reportRuntimeServicesCliError,
  throwRuntimeServiceFailure,
} from './runtime-services-errors';

export interface StorageStatusOptions {
  resources: ResourceRequirement[];
}

export function formatStorageStatus(options: StorageStatusOptions): string {
  const artifactStore = findRuntimeResource(options.resources, RUNTIME_RESOURCE_IDS.artifactStore);
  const vectorIndex = findRuntimeResource(options.resources, RUNTIME_RESOURCE_IDS.vectorIndex);
  const recordStore = findRuntimeResource(options.resources, RUNTIME_RESOURCE_IDS.recordStore);
  return [
    'Bridge runtime services storage',
    `${RUNTIME_RESOURCE_IDS.artifactStore}: ${formatResourceStatus(artifactStore)}`,
    `${RUNTIME_RESOURCE_IDS.vectorIndex}: ${formatResourceStatus(vectorIndex)}`,
    `${RUNTIME_RESOURCE_IDS.recordStore}: ${formatResourceStatus(recordStore)}`,
  ].join('\n');
}

export function formatArtifactList(artifacts: StoredArtifact[], limit = 20): string {
  const selected = [...artifacts]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    .slice(0, Math.max(1, limit));
  const lines = [`Bridge runtime services artifacts (${artifacts.length})`];
  if (selected.length === 0) {
    lines.push('No artifacts recorded.');
    return lines.join('\n');
  }
  for (const artifact of selected) {
    lines.push([
      `- ${artifact.id}`,
      `  created: ${artifact.createdAt}`,
      `  mime: ${artifact.mimeType}`,
      `  bytes: ${artifact.sizeBytes}`,
      `  path: ${artifact.path}`,
      `  source: ${formatArtifactSource(artifact.source)}`,
      ...(artifact.sourceUrl ? ['  sourceUrl: present'] : []),
      ...(artifact.expiresAt ? [`  expires: ${artifact.expiresAt}`] : []),
    ].join('\n'));
  }
  return lines.join('\n');
}

export async function cleanupArtifactsForCli(
  runtime: RuntimeServicesPort,
  optionsOrNow: { namespace?: string } | Date = {},
  now: Date = new Date(),
): Promise<string> {
  const cleanupNow = optionsOrNow instanceof Date ? optionsOrNow : now;
  const namespace = optionsOrNow instanceof Date
    ? getRuntimeServicesArtifactNamespace({})
    : optionsOrNow.namespace ?? getRuntimeServicesArtifactNamespace({});
  const result = await runtime.call<{ namespace: string; now: string }, ArtifactCleanupOutput>(
    'artifact.cleanupExpired',
    { namespace, now: cleanupNow.toISOString() },
    { consumer: 'domain-agent', purpose: 'operator artifact cleanup' },
  );
  if (result.status !== 'ok') {
    throwRuntimeServiceFailure('Bridge runtime services artifact cleanup', result);
  }
  return [
    'Bridge runtime services artifact cleanup',
    `namespace=${namespace}`,
    `deleted=${result.deleted.length}`,
    ...result.deleted.map((artifact) => `- ${artifact.id} ${artifact.path}`),
  ].join('\n');
}

export async function upsertBridgeContentForCli(
  input: { id: string; content: string },
  options: { runtime?: RuntimeServicesPort; tableName?: string; config?: Pick<AppConfig, 'runtimeServices'> } = {},
): Promise<string> {
  const tableName = options.tableName ?? getRuntimeServicesVectorTableName(options.config ?? {});
  const runtime = options.runtime ?? (await createRuntimeServicesPortContext({ consumer: 'domain-agent' })).runtime;
  const embedding = await runtime.call<{ input: string }, EmbeddingCreateOutput>(
    'embedding.create',
    { input: input.content },
    { consumer: 'domain-agent', purpose: 'operator vector upsert embedding' },
  );
  if (embedding.status !== 'ok' || !embedding.embedding) {
    throw new Error(embedding.evidence[0]?.message ?? embedding.status);
  }
  const result = await runtime.call<
    { tableName: string; id: string; content: string; embedding: number[]; metadata: Record<string, unknown> },
    VectorUpsertOutput
  >(
    'vector.upsert',
    {
      tableName,
      id: input.id,
      content: input.content,
      embedding: embedding.embedding,
      metadata: {
        sourceKind: 'operator_storage_cli',
      },
    },
    { consumer: 'domain-agent', purpose: 'operator vector upsert' },
  );
  if (result.status !== 'ok') throw new Error(result.evidence[0]?.message ?? result.status);
  return [
    'Bridge runtime services vector upsert',
    `tableName=${tableName}`,
    `id=${result.id ?? input.id}`,
    `model=${embedding.modelId}`,
    `dims=${embedding.embedding.length}`,
  ].join('\n');
}

export async function searchBridgeContentForCli(
  input: { query: string; limit?: number },
  options: { runtime?: RuntimeServicesPort; tableName?: string; config?: Pick<AppConfig, 'runtimeServices'> } = {},
): Promise<string> {
  const tableName = options.tableName ?? getRuntimeServicesVectorTableName(options.config ?? {});
  const runtime = options.runtime ?? (await createRuntimeServicesPortContext()).runtime;
  const result = await runtime.call<{ tableName: string; query: string; limit?: number }, VectorSearchOutput>(
    'vector.search',
    { tableName, query: input.query, limit: input.limit },
    { consumer: 'domain-agent', purpose: 'operator vector search' },
  );
  if (result.status !== 'ok') {
    throwRuntimeServiceFailure('Bridge runtime services vector search', result);
  }
  return formatVectorSearchResults(result.results);
}

export function formatVectorSearchResults(results: VectorSearchResult[]): string {
  const lines = [`Bridge runtime services vector search (${results.length})`];
  if (results.length === 0) {
    lines.push('No matching vectors.');
    return lines.join('\n');
  }
  for (const result of results) {
    lines.push([
      `- ${result.id}`,
      `  score: ${result.score.toFixed(4)}`,
      `  content: ${result.content}`,
      `  metadata: ${formatArtifactSource(result.metadata)}`,
    ].join('\n'));
  }
  return lines.join('\n');
}

export async function runStorageStatusCli(): Promise<void> {
  try {
    const context = await createRuntimeServicesPortContext();
    console.log(formatStorageStatus({ resources: context.resources }));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

export async function runStorageVectorsUpsertCli(
  id: string,
  contentParts: string[],
  options: { tableName?: string } = {},
): Promise<void> {
  try {
    const config = await loadConfig();
    console.log(await upsertBridgeContentForCli({
      id,
      content: contentParts.join(' '),
    }, {
      tableName: options.tableName,
      config,
    }));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

export async function runStorageVectorsSearchCli(
  queryParts: string[],
  options: { limit?: string; tableName?: string } = {},
): Promise<void> {
  try {
    const config = await loadConfig();
    console.log(await searchBridgeContentForCli({
      query: queryParts.join(' '),
      limit: parsePositiveInteger(options.limit, 10),
    }, {
      tableName: options.tableName,
      config,
    }));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

export async function runStorageArtifactsListCli(options: { limit?: string; namespace?: string } = {}): Promise<void> {
  try {
    const limit = parsePositiveInteger(options.limit, 20);
    const config = await loadConfig();
    const namespace = options.namespace ?? getRuntimeServicesArtifactNamespace(config);
    const context = await createRuntimeServicesPortContext();
    const result = await context.runtime.call<{ namespace: string }, ArtifactListOutput>(
      'artifact.list',
      { namespace },
      { consumer: 'domain-agent', purpose: 'operator artifact list' },
    );
    if (result.status !== 'ok') {
      throwRuntimeServiceFailure('Bridge runtime services artifacts list', result);
    }
    console.log(formatArtifactList(result.artifacts, limit));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

export async function runStorageArtifactsCleanupCli(options: { namespace?: string } = {}): Promise<void> {
  try {
    const config = await loadConfig();
    const namespace = options.namespace ?? getRuntimeServicesArtifactNamespace(config);
    const context = await createRuntimeServicesPortContext({ consumer: 'domain-agent' });
    console.log(await cleanupArtifactsForCli(context.runtime, { namespace }));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

function formatResourceStatus(resource: ResourceRequirement | undefined): string {
  if (!resource) return 'missing_resource';
  return resource.provider ? `${resource.status} via ${resource.provider}` : resource.status;
}

function formatArtifactSource(source: StoredArtifact['source'] | undefined): string {
  if (!source) return '{}';
  const kind = typeof source.kind === 'string' ? source.kind : undefined;
  const modelId = typeof source.modelId === 'string' ? source.modelId : undefined;
  const moduleId = typeof source.moduleId === 'string' ? source.moduleId : undefined;
  const compact = [kind, moduleId, modelId].filter(Boolean).join('/');
  return compact || JSON.stringify(source);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
