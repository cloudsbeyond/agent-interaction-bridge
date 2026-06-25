import type {
  ResourceRequirement,
  ResourcesListOutput,
} from '../../runtime-services/types';
import type { RuntimeServicesPort } from '../../runtime-services/port';
import {
  modelResourceIds,
  RUNTIME_RESOURCE_IDS,
} from '../../runtime-services/resources';
import { createRuntimeServicesPortContext } from '../../runtime-services/selector';
import {
  reportRuntimeServicesCliError,
  throwRuntimeServiceFailure,
} from './runtime-services-errors';

export function formatModelProviders(resources: ResourceRequirement[] = []): string {
  const lines = [
    'Bridge runtime services model providers',
    'provider config is owned by agent-runtime-services',
  ];
  const modelResources = resources.filter((resource) => modelResourceIds().includes(resource.id as ReturnType<typeof modelResourceIds>[number]));
  if (modelResources.length === 0) {
    lines.push('No model resources reported. Start agent-runtime-services JSON-RPC or run: agent-runtime-services models list');
    return lines.join('\n');
  }
  for (const resource of modelResources) {
    const provider = resource.provider ? ` via ${resource.provider}` : '';
    lines.push(`- ${resource.id}: ${resource.status}${provider}`);
  }
  return lines.join('\n');
}

export type BridgeModelSmokeModule = 'language' | 'embedding' | 'vision' | 'all';

export type BridgeModelSmokeResult =
  {
    moduleId: Exclude<BridgeModelSmokeModule, 'all'>;
    resource: ResourceRequirement;
  };

export interface BridgeModelSmokeOptions {
  module?: BridgeModelSmokeModule;
  runtime?: RuntimeServicesPort;
}

export async function smokeModelProviders(
  options: BridgeModelSmokeOptions = {},
): Promise<BridgeModelSmokeResult[]> {
  const runtime = options.runtime ?? (await createRuntimeServicesPortContext({ consumer: 'domain-agent' })).runtime;
  const status = await runtime.call<{ module: BridgeModelSmokeModule }, ResourcesListOutput>(
    'resources.smoke',
    { module: options.module ?? 'all' },
    { consumer: 'domain-agent', purpose: 'operator-triggered model smoke' },
  );
  if (status.status !== 'ok') {
    throwRuntimeServiceFailure('Bridge runtime services model smoke', status);
  }
  const resourceIds = new Set(resourceIdsForSmokeModule(options.module ?? 'all'));
  return status.resources
    .filter((resource) => resourceIds.has(resource.id))
    .map((resource) => ({
      moduleId: moduleIdForResource(resource.id),
      resource,
    }));
}

export function formatModelSmokeResults(results: BridgeModelSmokeResult[]): string {
  return [
    'Bridge runtime services model smoke',
    ...results.map((result) => {
      const provider = result.resource.provider ? ` via ${result.resource.provider}` : '';
      return `- ${result.moduleId} ${result.resource.id}: ${result.resource.status}${provider}`;
    }),
  ].join('\n');
}

export async function runModelsListCli(): Promise<void> {
  try {
    const context = await createRuntimeServicesPortContext();
    const status = await context.runtime.call<Record<string, never>, ResourcesListOutput>(
      'resources.status',
      {},
      { consumer: 'domain-agent', purpose: 'model resource status' },
    );
    if (status.status !== 'ok') {
      throwRuntimeServiceFailure('Bridge runtime services model providers', status);
    }
    console.log(formatModelProviders(status.resources));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

export async function runModelsSmokeCli(
  options: { module?: string } = {},
): Promise<void> {
  try {
    const module = parseSmokeModule(options.module);
    console.log(formatModelSmokeResults(await smokeModelProviders({ module })));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}

function parseSmokeModule(module: string | undefined): BridgeModelSmokeModule {
  if (!module) return 'all';
  if (module === 'all' || module === 'language' || module === 'embedding' || module === 'vision') {
    return module;
  }
  throw new Error(`unknown Runtime Services model smoke module: ${module}`);
}

function resourceIdsForSmokeModule(module: BridgeModelSmokeModule): string[] {
  if (module === 'language') return [RUNTIME_RESOURCE_IDS.languageCompletion];
  if (module === 'embedding') return [RUNTIME_RESOURCE_IDS.embedding];
  if (module === 'vision') return [RUNTIME_RESOURCE_IDS.imageGeneration];
  return [...modelResourceIds()];
}

function moduleIdForResource(resourceId: string): Exclude<BridgeModelSmokeModule, 'all'> {
  if (resourceId === RUNTIME_RESOURCE_IDS.embedding) return 'embedding';
  if (resourceId === RUNTIME_RESOURCE_IDS.imageGeneration) return 'vision';
  return 'language';
}
