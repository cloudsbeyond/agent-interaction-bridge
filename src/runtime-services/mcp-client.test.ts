import { describe, expect, test } from 'vitest';
import { createHttpMcpTransport, createMcpRuntimeServicesPort } from './mcp-client';
import { mcpToolNameForCapability } from './mappings';

describe('MCP RuntimeServicesPort adapter', () => {
  test('maps runtime capability ids to runtime.* MCP tools', async () => {
    const calls: Array<{ name: string; input: unknown }> = [];
    const runtime = createMcpRuntimeServicesPort({
      transport: {
        listTools: async () => [
          { name: 'runtime.language.complete' },
          { name: 'runtime.custom.capability' },
        ],
        callTool: async (name, input) => {
          calls.push({ name, input });
          return {
            status: 'ok',
            capabilityId: 'language.complete',
            providerId: 'runtime-services-mcp',
            modelId: 'mock-model',
            evidence: [],
            proposal: { kind: 'text', text: 'mcp proposal', raw: {} },
          };
        },
      },
    });

    await expect(runtime.describe()).resolves.toMatchObject({
      transport: 'mcp',
      capabilities: [
        { id: 'language.complete' },
        { id: 'custom.capability' },
      ],
    });

    await expect(runtime.call(
      'language.complete',
      { input: 'hello' },
      { consumer: 'domain-agent' },
    )).resolves.toMatchObject({
      status: 'ok',
      proposal: { text: 'mcp proposal' },
    });
    expect(calls).toEqual([
      { name: mcpToolNameForCapability('language.complete'), input: { input: 'hello' } },
    ]);
  });

  test('keeps MCP transport capability exposure owned by Runtime Services', async () => {
    const calls: string[] = [];
    const runtime = createMcpRuntimeServicesPort({
      transport: {
        listTools: async () => [{ name: 'runtime.artifact.save' }],
        callTool: async (name) => {
          calls.push(name);
          return {
            status: 'ok',
            capabilityId: 'artifact.save',
            providerId: 'runtime-services-mcp',
            modelId: 'not-applicable',
            evidence: [],
          };
        },
      },
    });

    await expect(runtime.call(
      'artifact.save',
      { sourceUrl: 'https://example.test/report.png' },
      { consumer: 'domain-agent' },
    )).resolves.toMatchObject({
      status: 'ok',
      providerId: 'runtime-services-mcp',
    });
    expect(calls).toEqual(['runtime.artifact.save']);
  });

  test('can use HTTP /mcp tools/list and tools/call as the downstream transport', async () => {
    const requests: Array<{ url: string; method: string; params: unknown }> = [];
    const runtime = createMcpRuntimeServicesPort({
      transport: createHttpMcpTransport({
        endpoint: 'https://runtime.example',
        fetch: async (input, init) => {
          const body = JSON.parse(String(init?.body)) as {
            method: string;
            params: unknown;
          };
          requests.push({ url: String(input), method: body.method, params: body.params });
          const result = body.method === 'tools/list'
            ? { tools: [{ name: 'runtime.language.complete' }] }
            : {
                structuredContent: {
                  status: 'ok',
                  capabilityId: 'language.complete',
                  providerId: 'runtime-services-mcp',
                  modelId: 'mock-model',
                  evidence: [],
                  proposal: { kind: 'text', text: 'http mcp proposal', raw: {} },
                },
              };
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
        timeoutMs: 1000,
      }),
    });

    await expect(runtime.describe()).resolves.toMatchObject({
      transport: 'mcp',
      capabilities: [{ id: 'language.complete' }],
    });
    await expect(runtime.call(
      'language.complete',
      { input: 'hello' },
      { consumer: 'domain-agent' },
    )).resolves.toMatchObject({
      status: 'ok',
      proposal: { text: 'http mcp proposal' },
    });

    expect(requests).toEqual([
      { url: 'https://runtime.example/mcp', method: 'tools/list', params: {} },
      {
        url: 'https://runtime.example/mcp',
        method: 'tools/call',
        params: { name: 'runtime.language.complete', arguments: { input: 'hello' } },
      },
    ]);
  });
});
