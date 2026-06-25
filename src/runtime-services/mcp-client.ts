import {
  capabilityDescriptorFromMcpTool,
  mcpToolNameForCapability,
} from './mappings';
import {
  decideRuntimeCapabilityAccess,
  deniedRuntimeServiceEnvelope,
  failedRuntimeServiceEnvelope,
} from './policy';
import type { RuntimeServicesPort } from './port';
import type {
  RuntimeCapabilityId,
  RuntimeConsumer,
  RuntimeServiceEnvelope,
} from './types';

export interface RuntimeMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface RuntimeMcpTransport {
  listTools(): Promise<RuntimeMcpTool[]>;
  callTool(name: string, input: unknown): Promise<unknown>;
}

export interface RuntimeServicesMcpPortOptions {
  transport: RuntimeMcpTransport;
  allowlist?: ReadonlySet<RuntimeCapabilityId>;
}

export interface RuntimeServicesHttpMcpTransportOptions {
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

interface McpToolsListResult {
  tools?: RuntimeMcpTool[];
}

interface McpToolsCallResult {
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
}

export function createHttpMcpTransport(options: RuntimeServicesHttpMcpTransportOptions): RuntimeMcpTransport {
  let id = 0;
  const endpoint = normalizeRuntimeServicesMcpEndpoint(options.endpoint);
  const fetchImpl = options.fetch ?? fetch;

  async function callMcp<T>(method: string, params: unknown): Promise<T> {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++id,
        method,
        params,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1000),
    });
    if (!response.ok) throw new Error(`runtime services mcp failed (${response.status})`);
    const payload = await response.json() as JsonRpcResponse<T>;
    if (payload.error) throw new Error(payload.error.message ?? 'runtime services mcp error');
    return payload.result as T;
  }

  return {
    listTools: async () => {
      const result = await callMcp<McpToolsListResult>('tools/list', {});
      return result.tools ?? [];
    },
    callTool: async (name, input) => {
      const result = await callMcp<McpToolsCallResult | unknown>('tools/call', {
        name,
        arguments: input,
      });
      return unwrapMcpToolResult(result);
    },
  };
}

export function createMcpRuntimeServicesPort(options: RuntimeServicesMcpPortOptions): RuntimeServicesPort {
  return {
    describe: async () => {
      const capabilities = (await options.transport.listTools())
        .map(capabilityDescriptorFromMcpTool)
        .filter((capability): capability is NonNullable<typeof capability> => Boolean(capability))
        .filter((capability) => !options.allowlist || options.allowlist.has(capability.id));
      return {
        schemaVersion: 1,
        capabilities,
        transport: 'mcp',
      };
    },

    call: async <TInput, TOutput extends object>(
      capabilityId: RuntimeCapabilityId,
      input: TInput,
      callOptions?: { consumer: RuntimeConsumer; purpose?: string },
    ): Promise<RuntimeServiceEnvelope<TOutput>> => {
      const decision = decideRuntimeCapabilityAccess({
        transport: 'mcp',
        capabilityId,
        consumer: callOptions?.consumer ?? 'domain-agent',
        purpose: callOptions?.purpose,
        mcpAllowlist: options.allowlist,
      });
      if (!decision.allowed) {
        return deniedRuntimeServiceEnvelope(capabilityId, decision.reason ?? 'runtime service capability denied');
      }
      try {
        const result = await options.transport.callTool(mcpToolNameForCapability(capabilityId), input);
        return result as RuntimeServiceEnvelope<TOutput>;
      } catch (error) {
        return failedRuntimeServiceEnvelope(
          capabilityId,
          'runtime-services-mcp',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}

export function normalizeRuntimeServicesMcpEndpoint(endpoint: string): string {
  const parsed = new URL(endpoint);
  if (parsed.pathname === '' || parsed.pathname === '/') {
    parsed.pathname = '/mcp';
  }
  return parsed.toString().replace(/\/$/, '');
}

function unwrapMcpToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const record = result as McpToolsCallResult;
  if (record.structuredContent) return record.structuredContent;
  const text = record.content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) return result;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return result;
  }
}
