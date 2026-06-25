import { createMcpRuntimeServicesPort } from './mcp-client';
import { createRpcRuntimeServicesPort } from './rpc-client';
import { describe, expect, test } from 'vitest';

describe('Runtime Services adapter parity', () => {
  test('RPC and MCP adapters expose the same envelope shape for one capability', async () => {
    const envelope = {
      status: 'ok',
      capabilityId: 'language.complete',
      providerId: 'mock-runtime-services',
      modelId: 'mock-model',
      evidence: [{ kind: 'mock' }],
      proposal: { kind: 'text', text: 'same proposal', raw: {} },
    } as const;

    const rpc = createRpcRuntimeServicesPort({
      endpoint: 'http://runtime.test',
      fetch: async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: envelope }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      timeoutMs: 1000,
    });
    const mcp = createMcpRuntimeServicesPort({
      transport: {
        listTools: async () => [{ name: 'runtime.language.complete' }],
        callTool: async () => envelope,
      },
    });

    const input = { input: 'hello' };
    const rpcResult = await rpc.call('language.complete', input, { consumer: 'domain-agent' });
    const mcpResult = await mcp.call('language.complete', input, { consumer: 'domain-agent' });

    expect(normalizeEnvelope(rpcResult)).toEqual(normalizeEnvelope(mcpResult));
  });
});

function normalizeEnvelope(value: unknown): Record<string, unknown> {
  const envelope = value as Record<string, unknown>;
  return {
    status: envelope.status,
    capabilityId: envelope.capabilityId,
    providerId: envelope.providerId,
    modelId: envelope.modelId,
    evidenceKind: Array.isArray(envelope.evidence)
      ? (envelope.evidence[0] as { kind?: string } | undefined)?.kind
      : undefined,
    proposal: envelope.proposal,
  };
}
