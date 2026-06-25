import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, test } from 'vitest';
import { runtimePortMock, runtimeResources } from '../test/runtime-services-fixtures';
import {
  createRuntimeServicesPortContext,
  runtimeServicesRpcUrlFromEnv,
  runtimeServicesTransportFromEnv,
} from './selector';

describe('RuntimeServicesPort selector', () => {
  test('defaults to explicit local RPC transport and endpoint config', () => {
    expect(runtimeServicesTransportFromEnv({})).toBe('rpc');
    expect(runtimeServicesTransportFromEnv({ AGENT_RUNTIME_SERVICES_TRANSPORT: 'mcp' })).toBe('rpc');
    expect(runtimeServicesRpcUrlFromEnv({})).toBe('http://127.0.0.1:8765');
    expect(runtimeServicesRpcUrlFromEnv({ AGENT_RUNTIME_SERVICES_URL: 'http://127.0.0.1:9999' }))
      .toBe('http://127.0.0.1:9999');
  });

  test('can inject a RuntimeServicesPort and resources for bridge tests', async () => {
    const resources = runtimeResources([
      { id: 'model.language_completion', status: 'available', provider: 'mock-provider:mock-model' },
    ]);
    const runtime = runtimePortMock({});

    const context = await createRuntimeServicesPortContext({
      runtime,
      resources,
    });

    expect(context.runtime).toBe(runtime);
    expect(context.resources).toEqual(resources);
  });

  test('uses local /rpc JSON-RPC without in-process Runtime Services fallback', async () => {
    const server = await startJsonRpcServer(async (method, params) => {
      if (method === 'version') {
        return { name: 'agent-runtime-services', version: '0.1.0-test' };
      }
      if (method === 'capabilities.describe') {
        return {
          schemaVersion: 1,
          capabilities: [
            { id: 'language.complete', title: 'Language completion' },
            { id: 'resources.status', title: 'Resource status' },
          ],
        };
      }
      if (method === 'resources.status') {
        return {
          status: 'ok',
          capabilityId: 'resources.status',
          providerId: 'runtime-services-rpc',
          modelId: 'not-applicable',
          evidence: [],
          resources: runtimeResources([
            { id: 'model.language_completion', status: 'available', provider: 'runtime-services-rpc:mock-model' },
          ]),
        };
      }
      if (method === 'language.complete') {
        return {
          status: 'ok',
          capabilityId: 'language.complete',
          providerId: 'runtime-services-rpc',
          modelId: 'mock-model',
          evidence: [{ kind: 'mock', data: params }],
          proposal: { kind: 'text', text: 'rpc proposal', raw: {} },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    try {
      const context = await createRuntimeServicesPortContext({
        runtimeServicesUrl: server.url,
        rpcTimeoutMs: 1000,
      });

      expect(context.resources).toHaveLength(1);
      await expect(context.runtime.call(
        'language.complete',
        { input: 'reply only: pong' },
        { consumer: 'domain-agent' },
      )).resolves.toMatchObject({
        status: 'ok',
        capabilityId: 'language.complete',
        proposal: { kind: 'text', text: 'rpc proposal' },
      });
      expect(server.requests.map(formatRequest)).toEqual([
        'GET /health',
        'POST /rpc version',
        'POST /rpc capabilities.describe',
        'POST /rpc resources.status',
        'POST /rpc language.complete',
      ]);
    } finally {
      await server.close();
    }
  });

  test('does not mask failed resources.status discovery as an empty resource list', async () => {
    const runtime = runtimePortMock({
      'resources.status': async () => ({
        status: 'failed',
        capabilityId: 'resources.status',
        providerId: 'runtime-services',
        modelId: 'not-applicable',
        evidence: [{ kind: 'resource_error', message: 'resource registry unavailable' }],
      }),
    });

    await expect(createRuntimeServicesPortContext({
      runtime,
    })).rejects.toThrow('resource registry unavailable');
  });
});

async function startJsonRpcServer(
  dispatch: (method: string, params: unknown) => Promise<unknown> | unknown,
): Promise<{
  url: string;
  requests: Array<{ method: string; url: string; rpcMethod?: string }>;
  close(): Promise<void>;
}> {
  const requests: Array<{ method: string; url: string; rpcMethod?: string }> = [];
  const server = createServer((request, response) => {
    void handleRequest(request, response, dispatch, requests);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dispatch: (method: string, params: unknown) => Promise<unknown> | unknown,
  requests: Array<{ method: string; url: string; rpcMethod?: string }>,
): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    requests.push({ method: 'GET', url: '/health' });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/rpc') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rpc = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    id?: string | number | null;
    method?: string;
    params?: unknown;
  };
  requests.push({ method: 'POST', url: '/rpc', rpcMethod: rpc.method });
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    jsonrpc: '2.0',
    id: rpc.id ?? null,
    result: await dispatch(rpc.method ?? '', rpc.params ?? {}),
  }));
}

function formatRequest(request: { method: string; url: string; rpcMethod?: string }): string {
  return [request.method, request.url, request.rpcMethod].filter(Boolean).join(' ');
}
