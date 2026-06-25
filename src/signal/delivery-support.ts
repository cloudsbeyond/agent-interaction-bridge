import type {
  ArtifactSaveOutput,
  LanguageCompleteOutput,
  ResourceRequirement,
  ResourcesListOutput,
  RuntimeServiceEnvelope,
  StoredArtifact,
  VisionGenerateImageOutput,
} from '../runtime-services/types';
import type { RuntimeServicesPort } from '../runtime-services/port';
import {
  RUNTIME_RESOURCE_IDS,
  runtimeResourceKind,
  type RuntimeResourceId,
} from '../runtime-services/resources';
import { createRuntimeServicesPortContext } from '../runtime-services/selector';
import {
  getRuntimeServicesArtifactNamespace,
  type RuntimeServicesConfig,
} from '../config/schema';
import type { AgentSignal, RepresentationStyle } from './router';

export type DeliverySupportKind =
  | 'summarize'
  | 'render_html'
  | 'generate_image'
  | 'synthesize_voice'
  | 'transcode_file';

export interface DeliverySupportInput {
  title: string;
  summary: string;
  artifactPath?: string;
  sourceSignalKind: AgentSignal['kind'];
}

export interface DeliverySupportRequest {
  id: string;
  kind: DeliverySupportKind;
  sourceSignalId?: string;
  outputStyle: RepresentationStyle['id'];
  input: DeliverySupportInput;
  authority: 'presentation_only' | 'decision_making';
  stateless: boolean;
}

export type DeliverySupportOutcome =
  | {
      status: 'ready';
      requestId: string;
      outputStyle: RepresentationStyle['id'];
      body: string;
      usedResourceId: string;
      artifact?: StoredArtifact;
    }
  | {
      status: 'missing_resource';
      requestId: string;
      outputStyle: RepresentationStyle['id'];
      resource: ResourceRequirement;
      message: string;
    }
  | {
      status: 'rejected';
      requestId: string;
      reason: string;
    };

export interface DeliverySupportExecutorOptions {
  resources?: ResourceRequirement[];
  runtime?: RuntimeServicesPort;
  env?: Record<string, string | undefined>;
  runtimeServicesUrl?: string;
  rpcFetch?: typeof fetch;
  rpcTimeoutMs?: number;
  storage?: RuntimeServicesConfig;
}

const JUDGMENT_SIGNAL_KINDS = new Set<AgentSignal['kind']>([
  'risk_approval',
  'choice',
  'status',
]);

export function createDeliverySupportRequest(
  signal: AgentSignal,
  outputStyle: RepresentationStyle['id'],
): DeliverySupportRequest | undefined {
  if (JUDGMENT_SIGNAL_KINDS.has(signal.kind)) return undefined;
  const kind = supportKindForStyle(outputStyle);
  if (!kind) return undefined;
  return {
    id: `support-${signal.id ?? signal.kind}-${outputStyle}`,
    sourceSignalId: signal.id,
    kind,
    outputStyle,
    input: {
      title: signal.title,
      summary: signal.summary,
      artifactPath: signal.kind === 'artifact_preview' ? signal.artifact.path : undefined,
      sourceSignalKind: signal.kind,
    },
    authority: 'presentation_only',
    stateless: true,
  };
}

export function isDeliverySupportAllowed(request: DeliverySupportRequest): boolean {
  return request.stateless === true && request.authority === 'presentation_only';
}

export async function executeDeliverySupport(
  request: DeliverySupportRequest,
  options: DeliverySupportExecutorOptions = {},
): Promise<DeliverySupportOutcome> {
  if (!isDeliverySupportAllowed(request)) {
    return {
      status: 'rejected',
      requestId: request.id,
      reason: 'delivery support must be stateless and presentation-only',
    };
  }

  if (request.kind === 'summarize') {
    return {
      status: 'ready',
      requestId: request.id,
      outputStyle: request.outputStyle,
      body: `**${request.input.title}**\n${request.input.summary}`,
      usedResourceId: 'local.rule_based_summary',
    };
  }

  const resourceId = resourceIdForSupportKind(request.kind);
  const resource = await deliveryResource(resourceId, options);
  if (resource.status !== 'available') {
    return {
      status: 'missing_resource',
      requestId: request.id,
      outputStyle: request.outputStyle,
      resource,
      message: resource.operatorAction,
    };
  }

  if (resource.id === RUNTIME_RESOURCE_IDS.languageCompletion) {
    const runtime = await deliveryRuntimeServices(options).catch(() => undefined);
    if (!runtime) return missingFromService(request, resource, 'Runtime Services transport is unavailable');
    const result = await runtime.call<{ input: string }, LanguageCompleteOutput>(
      'language.complete',
      { input: presentationTransformPrompt(request) },
      { consumer: 'domain-agent', purpose: 'presentation transform' },
    );
    if (result.status === 'missing_resource') {
      return missingFromService(request, resource, result.evidence[0]?.message ?? resource.operatorAction);
    }
    if (result.status === 'ok' && result.proposal?.kind === 'text' && result.proposal.text.trim()) {
      return {
        status: 'ready',
        requestId: request.id,
        outputStyle: request.outputStyle,
        body: result.proposal.text.trim(),
        usedResourceId: resource.id,
      };
    }
    return missingFromService(request, resource, result.evidence[0]?.message ?? 'presentation transform did not return a typed proposal');
  }

  if (resource.id === RUNTIME_RESOURCE_IDS.imageGeneration) {
    const runtime = await deliveryRuntimeServices(options).catch(() => undefined);
    if (!runtime) return missingFromService(request, resource, 'Runtime Services transport is unavailable');
    const result = await runtime.call<{ prompt: string }, VisionGenerateImageOutput>(
      'vision.generateImage',
      { prompt: imageGenerationPrompt(request) },
      { consumer: 'domain-agent', purpose: 'image delivery support' },
    );
    if (result.status === 'missing_resource') {
      return missingFromService(request, resource, result.evidence[0]?.message ?? resource.operatorAction);
    }
    if (result.status === 'ok' && result.artifact) {
      const artifact = await saveGeneratedImageArtifact(runtime, result, options.storage);
      const body = result.artifact.url ?? result.artifact.b64Json;
      if (!body) return missingFromService(request, resource, 'image generation did not return an artifact body');
      return {
        status: 'ready',
        requestId: request.id,
        outputStyle: request.outputStyle,
        body,
        usedResourceId: resource.id,
        ...(artifact ? { artifact } : {}),
      };
    }
    return missingFromService(request, resource, result.evidence[0]?.message ?? 'image generation did not return a typed artifact');
  }

  return missingFromService(request, resource, 'delivery support resource is available but no typed runtime service result was produced');
}

async function deliveryRuntimeServices(options: DeliverySupportExecutorOptions): Promise<RuntimeServicesPort> {
  if (options.runtime) return options.runtime;
  const context = await createRuntimeServicesPortContext({
    ...(options.env ? { env: options.env } : {}),
    ...(options.runtimeServicesUrl ? { runtimeServicesUrl: options.runtimeServicesUrl } : {}),
    ...(options.rpcFetch ? { rpcFetch: options.rpcFetch } : {}),
    ...(options.rpcTimeoutMs ? { rpcTimeoutMs: options.rpcTimeoutMs } : {}),
  });
  return context.runtime;
}

async function deliveryResource(
  resourceId: RuntimeResourceId,
  options: DeliverySupportExecutorOptions,
): Promise<ResourceRequirement> {
  const resources = options.resources ?? await deliveryResourcesFromRuntimeServices(options).catch(() => []);
  return resources.find((resource) => resource.id === resourceId) ?? missingRuntimeServicesResource(resourceId);
}

async function deliveryResourcesFromRuntimeServices(
  options: DeliverySupportExecutorOptions,
): Promise<ResourceRequirement[]> {
  if (options.resources) return options.resources;
  const runtime = await deliveryRuntimeServices(options);
  const result = await runtime.call<Record<string, never>, ResourcesListOutput>(
    'resources.status',
    {},
    { consumer: 'domain-agent', purpose: 'delivery resource discovery' },
  );
  return result.status === 'ok' ? result.resources : [];
}

async function saveGeneratedImageArtifact(
  runtime: RuntimeServicesPort,
  result: RuntimeServiceEnvelope<VisionGenerateImageOutput>,
  storage: RuntimeServicesConfig | undefined,
): Promise<StoredArtifact | undefined> {
  if (result.status !== 'ok' || !result.artifact) return undefined;
  const artifactInput = result.artifact.url
    ? {
        namespace: getRuntimeServicesArtifactNamespace({ runtimeServices: storage }),
        sourceUrl: result.artifact.url,
      }
    : undefined;
  if (!artifactInput) return undefined;
  const saved = await runtime.call<typeof artifactInput & { source: Record<string, unknown> }, ArtifactSaveOutput>(
    'artifact.save',
    {
      ...artifactInput,
      source: {
        kind: 'delivery_support',
        moduleId: 'vision',
        providerId: result.providerId,
        modelId: result.modelId,
      },
    },
    { consumer: 'domain-agent', purpose: 'persist generated delivery artifact' },
  );
  return saved.status === 'ok' ? saved.artifact : undefined;
}

function missingFromService(
  request: DeliverySupportRequest,
  resource: ResourceRequirement,
  message: string,
): DeliverySupportOutcome {
  return {
    status: 'missing_resource',
    requestId: request.id,
    outputStyle: request.outputStyle,
    resource,
    message,
  };
}

function missingRuntimeServicesResource(resourceId: RuntimeResourceId): ResourceRequirement {
  return {
    id: resourceId,
    kind: runtimeResourceKind(resourceId),
    capability: 'runtime services JSON-RPC capability',
    purpose: 'Runtime Services capability required by bridge delivery support.',
    status: 'stubbed',
    operatorAction: 'Start agent-runtime-services JSON-RPC or configure AGENT_RUNTIME_SERVICES_URL.',
  };
}

function imageGenerationPrompt(request: DeliverySupportRequest): string {
  return [
    request.input.title,
    request.input.summary,
    request.input.artifactPath ? `Source artifact: ${request.input.artifactPath}` : '',
    'Generate a visual presentation artifact only. Do not imply task approval or execution.',
  ]
    .filter(Boolean)
    .join('\n');
}

function presentationTransformPrompt(request: DeliverySupportRequest): string {
  return [
    'You are a stateless presentation transformer inside agent-interaction-bridge.',
    'Authority boundary: do not choose tools, approve risk, execute work, change session state, or add new task decisions.',
    `Output style: ${request.outputStyle}`,
    `Support kind: ${request.kind}`,
    `Source signal kind: ${request.input.sourceSignalKind}`,
    `Title: ${request.input.title}`,
    `Summary: ${request.input.summary}`,
    request.input.artifactPath ? `Artifact path: ${request.input.artifactPath}` : '',
    'Return only the transformed presentation body.',
  ]
    .filter(Boolean)
    .join('\n');
}

function supportKindForStyle(style: RepresentationStyle['id']): DeliverySupportKind | undefined {
  switch (style) {
    case 'markdown':
    case 'text':
      return 'summarize';
    case 'html':
      return 'render_html';
    case 'image':
      return 'generate_image';
    case 'voice':
      return 'synthesize_voice';
    case 'file':
      return 'transcode_file';
    default:
      return undefined;
  }
}

function resourceIdForSupportKind(kind: DeliverySupportKind): RuntimeResourceId {
  switch (kind) {
    case 'render_html':
    case 'synthesize_voice':
      return RUNTIME_RESOURCE_IDS.languageCompletion;
    case 'generate_image':
      return RUNTIME_RESOURCE_IDS.imageGeneration;
    case 'transcode_file':
      return RUNTIME_RESOURCE_IDS.artifactStore;
    case 'summarize':
      return RUNTIME_RESOURCE_IDS.languageCompletion;
  }
}
