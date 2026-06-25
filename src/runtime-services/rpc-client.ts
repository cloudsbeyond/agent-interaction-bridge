import { rpcMethodForCapability } from './mappings';
import {
  decideRuntimeCapabilityAccess,
  deniedRuntimeServiceEnvelope,
  failedRuntimeServiceEnvelope,
} from './policy';
import type { RuntimeServicesPort } from './port';
import type {
  RuntimeCapabilityId,
  RuntimeCapabilityIndex,
  RuntimeConsumer,
  RuntimeServiceEnvelope,
  RuntimeServicesVersion,
} from './types';

export interface RuntimeServicesRpcPortOptions {
  endpoint: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface RuntimeServicesRpcCaller {
  endpoint: string;
  healthEndpoint: string;
  health(): Promise<unknown>;
  call<T>(method: string, params: unknown): Promise<T>;
}

export interface RuntimeServicesRpcInitialization {
  health: unknown;
  version: RuntimeServicesVersion;
  capabilities: RuntimeCapabilityIndex;
}

export interface InitializedRuntimeServicesRpcPort {
  runtime: RuntimeServicesPort;
  initialization: RuntimeServicesRpcInitialization;
}

export function createRpcRuntimeServicesPort(options: RuntimeServicesRpcPortOptions): RuntimeServicesPort {
  return createRpcRuntimeServicesPortFromCaller(createRuntimeServicesRpcCaller(options));
}

export async function initializeRpcRuntimeServicesPort(
  options: RuntimeServicesRpcPortOptions,
): Promise<InitializedRuntimeServicesRpcPort> {
  const caller = createRuntimeServicesRpcCaller(options);
  const health = await caller.health();
  const version = await caller.call<RuntimeServicesVersion>('version', {});
  const capabilities = {
    ...(await caller.call<RuntimeCapabilityIndex>('capabilities.describe', {})),
    transport: 'rpc' as const,
  };
  return {
    runtime: createRpcRuntimeServicesPortFromCaller(caller),
    initialization: {
      health,
      version,
      capabilities,
    },
  };
}

function createRuntimeServicesRpcCaller(options: RuntimeServicesRpcPortOptions): RuntimeServicesRpcCaller {
  let id = 0;
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = normalizeRuntimeServicesRpcEndpoint(options.endpoint);
  const healthEndpoint = runtimeServicesHealthEndpointFromRpcEndpoint(endpoint);
  const timeoutMs = options.timeoutMs ?? 350;

  return {
    endpoint,
    healthEndpoint,
    async health(): Promise<unknown> {
      const response = await fetchImpl(healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`runtime services health failed (${response.status})`);
      }
      return response.json().catch(() => ({})) as Promise<unknown>;
    },
    async call<T>(method: string, params: unknown): Promise<T> {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++id,
          method,
          params,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`runtime services rpc failed (${response.status})`);
      }
      const payload = await response.json() as JsonRpcResponse<T>;
      if (payload.error) {
        throw new Error(payload.error.message ?? 'runtime services rpc error');
      }
      return payload.result as T;
    },
  };
}

function createRpcRuntimeServicesPortFromCaller(caller: RuntimeServicesRpcCaller): RuntimeServicesPort {
  return {
    describe: async () => ({
      ...(await caller.call<RuntimeCapabilityIndex>('capabilities.describe', {})),
      transport: 'rpc',
    }),

    call: async <TInput, TOutput extends object>(
      capabilityId: RuntimeCapabilityId,
      input: TInput,
      callOptions?: { consumer: RuntimeConsumer; purpose?: string },
    ): Promise<RuntimeServiceEnvelope<TOutput>> => {
      const decision = decideRuntimeCapabilityAccess({
        transport: 'rpc',
        capabilityId,
        consumer: callOptions?.consumer ?? 'domain-agent',
        purpose: callOptions?.purpose,
      });
      if (!decision.allowed) {
        return deniedRuntimeServiceEnvelope(capabilityId, decision.reason ?? 'runtime service capability denied');
      }
      try {
        return await caller.call<RuntimeServiceEnvelope<TOutput>>(rpcMethodForCapability(capabilityId), input);
      } catch (error) {
        return failedRuntimeServiceEnvelope(
          capabilityId,
          'runtime-services-rpc',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}

export function normalizeRuntimeServicesRpcEndpoint(endpoint: string): string {
  const parsed = new URL(endpoint);
  if (parsed.pathname === '' || parsed.pathname === '/') {
    parsed.pathname = '/rpc';
  }
  return parsed.toString().replace(/\/$/, '');
}

export function runtimeServicesHealthEndpointFromRpcEndpoint(endpoint: string): string {
  const parsed = new URL(normalizeRuntimeServicesRpcEndpoint(endpoint));
  parsed.pathname = '/health';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
