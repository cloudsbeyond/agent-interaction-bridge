import {
  createHttpMcpTransport,
  createMcpRuntimeServicesPort,
  type RuntimeMcpTransport,
} from './mcp-client';
import type { RuntimeServicesPort } from './port';
import {
  createRpcRuntimeServicesPort,
  initializeRpcRuntimeServicesPort,
} from './rpc-client';
import type {
  ResourceRequirement,
  ResourcesListOutput,
  RuntimeCapabilityId,
  RuntimeConsumer,
  RuntimeServicesTransport,
} from './types';

const DEFAULT_RUNTIME_SERVICES_RPC_URL = 'http://127.0.0.1:8765';

export interface RuntimeServicesPortContext {
  transport: RuntimeServicesTransport;
  runtimeServicesUrl?: string;
  runtime: RuntimeServicesPort;
  resources: ResourceRequirement[];
}

export interface RuntimeServicesPortContextOptions {
  runtime?: RuntimeServicesPort;
  resources?: ResourceRequirement[];
  env?: Record<string, string | undefined>;
  transport?: RuntimeServicesTransport;
  runtimeServicesUrl?: string;
  rpcFetch?: typeof fetch;
  rpcTimeoutMs?: number;
  runtimeServicesMcpUrl?: string;
  mcpTransport?: RuntimeMcpTransport;
  mcpAllowlist?: ReadonlySet<RuntimeCapabilityId>;
  mcpFetch?: typeof fetch;
  mcpTimeoutMs?: number;
  consumer?: RuntimeConsumer;
}

export function runtimeServicesRpcUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.AGENT_RUNTIME_SERVICES_URL?.trim() || DEFAULT_RUNTIME_SERVICES_RPC_URL;
}

export function runtimeServicesTransportFromEnv(
  _env: Record<string, string | undefined> = process.env,
): RuntimeServicesTransport {
  return 'rpc';
}

export function runtimeServicesMcpUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env.AGENT_RUNTIME_SERVICES_MCP_URL?.trim() || undefined;
}

export function selectRuntimeServicesPort(
  options: RuntimeServicesPortContextOptions = {},
): RuntimeServicesPort {
  if (options.runtime) return options.runtime;
  const env = options.env ?? process.env;
  const transport = options.transport ?? runtimeServicesTransportFromEnv(env);
  if (transport === 'mcp') {
    const mcpTransport = options.mcpTransport ?? createMcpTransportFromOptions(options, env);
    return createMcpRuntimeServicesPort({
      transport: mcpTransport,
      ...(options.mcpAllowlist ? { allowlist: options.mcpAllowlist } : {}),
    });
  }
  return createRpcRuntimeServicesPort({
    endpoint: options.runtimeServicesUrl ?? runtimeServicesRpcUrlFromEnv(env),
    ...(options.rpcFetch ? { fetch: options.rpcFetch } : {}),
    ...(options.rpcTimeoutMs ? { timeoutMs: options.rpcTimeoutMs } : {}),
  });
}

function createMcpTransportFromOptions(
  options: RuntimeServicesPortContextOptions,
  env: Record<string, string | undefined>,
): RuntimeMcpTransport {
  const endpoint = options.runtimeServicesMcpUrl ?? runtimeServicesMcpUrlFromEnv(env);
  if (!endpoint) {
    throw new Error('Runtime Services MCP transport selected but no AGENT_RUNTIME_SERVICES_MCP_URL was configured');
  }
  return createHttpMcpTransport({
    endpoint,
    ...(options.mcpFetch ? { fetch: options.mcpFetch } : {}),
    ...(options.mcpTimeoutMs ? { timeoutMs: options.mcpTimeoutMs } : {}),
  });
}

export async function createRuntimeServicesPortContext(
  options: RuntimeServicesPortContextOptions = {},
): Promise<RuntimeServicesPortContext> {
  const env = options.env ?? process.env;
  const transport = options.transport ?? runtimeServicesTransportFromEnv(env);
  if (!options.runtime && transport === 'rpc') {
    const runtimeServicesUrl = options.runtimeServicesUrl ?? runtimeServicesRpcUrlFromEnv(env);
    const initialized = await initializeRpcRuntimeServicesPort({
      endpoint: runtimeServicesUrl,
      ...(options.rpcFetch ? { fetch: options.rpcFetch } : {}),
      ...(options.rpcTimeoutMs ? { timeoutMs: options.rpcTimeoutMs } : {}),
    });
    const resources = options.resources ?? await loadRuntimeResources(initialized.runtime, options.consumer ?? 'domain-agent');
    return {
      transport,
      runtimeServicesUrl,
      runtime: initialized.runtime,
      resources,
    };
  }
  const runtime = selectRuntimeServicesPort({ ...options, transport });
  const resources = options.resources ?? await loadRuntimeResources(runtime, options.consumer ?? 'domain-agent');
  return {
    transport,
    runtime,
    resources,
    ...(transport === 'rpc' ? { runtimeServicesUrl: options.runtimeServicesUrl ?? runtimeServicesRpcUrlFromEnv(env) } : {}),
  };
}

async function loadRuntimeResources(
  runtime: RuntimeServicesPort,
  consumer: RuntimeConsumer,
): Promise<ResourceRequirement[]> {
  const result = await runtime.call<Record<string, never>, ResourcesListOutput>(
    'resources.status',
    {},
    { consumer, purpose: 'runtime resource discovery' },
  );
  if (result.status !== 'ok') {
    const message = result.evidence.find((item) => item.message)?.message
      ?? result.evidence[0]?.kind
      ?? result.status;
    throw new Error(`Runtime Services resources.status returned ${result.status}: ${message}`);
  }
  return result.resources;
}
