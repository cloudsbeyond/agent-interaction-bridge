import { describe, expect, test } from 'vitest';
import { runtimePortMock, runtimeResources } from '../../test/runtime-services-fixtures';
import {
  cleanupArtifactsForCli,
  formatArtifactList,
  formatStorageStatus,
  searchBridgeContentForCli,
  upsertBridgeContentForCli,
} from './storage';

describe('storage cli helpers', () => {
  test('formats bridge storage status without exposing artifact contents', () => {
    const output = formatStorageStatus({
      resources: runtimeResources([
        { id: 'storage.artifact_store', status: 'available', provider: 'runtime-artifact-store' },
        { id: 'storage.vector_index', status: 'available', provider: 'runtime-vector-store' },
        { id: 'storage.record_store', status: 'available', provider: 'runtime-record-store' },
      ]),
    });

    expect(output).toContain('Bridge runtime services storage');
    expect(output).toContain('storage.artifact_store: available via runtime-artifact-store');
    expect(output).toContain('storage.vector_index: available via runtime-vector-store');
    expect(output).toContain('storage.record_store: available via runtime-record-store');
  });

  test('lists artifact metadata and paths without printing stored bytes', async () => {
    const output = formatArtifactList([{
      id: 'artifact-1',
      path: '/tmp/runtime-services/artifacts/artifact-1.txt',
      mimeType: 'text/plain',
      sizeBytes: 20,
      sha256: 'hash',
      createdAt: '2026-05-28T08:00:00.000Z',
      source: { kind: 'delivery_support', modelId: 'runtime-language-model' },
      sourceUrl: 'https://example.test/signed-url?token=secret-url-token',
    }]);

    expect(output).toContain('Bridge runtime services artifacts');
    expect(output).toContain('text/plain');
    expect(output).toContain('/artifacts/');
    expect(output).toContain('delivery_support');
    expect(output).toContain('sourceUrl: present');
    expect(output).not.toContain('secret artifact body');
    expect(output).not.toContain('secret-url-token');
  });

  test('cleans expired artifacts through the local artifact store', async () => {
    const runtime = runtimePortMock({
      'artifact.cleanupExpired': async () => ({
          status: 'ok',
          capabilityId: 'artifact.cleanupExpired',
          providerId: 'runtime-artifact-store',
          modelId: 'not-applicable',
          evidence: [],
          deleted: [{
            id: 'artifact-expired',
            path: '/tmp/runtime-services/artifacts/artifact-expired.txt',
            mimeType: 'text/plain',
            sizeBytes: 7,
            sha256: 'hash',
            createdAt: '2026-05-28T08:00:00.000Z',
            expiresAt: '2026-05-28T08:30:00.000Z',
            source: {},
          }],
        }),
    });

    const output = await cleanupArtifactsForCli(runtime, new Date('2026-05-28T09:00:00.000Z'));

    expect(output).toContain('deleted=1');
    expect(output).toContain('artifact-expired');
  });

  test('does not report cleanup failed envelopes as empty success', async () => {
    const runtime = runtimePortMock({
      'artifact.cleanupExpired': async () => ({
          status: 'failed',
          capabilityId: 'artifact.cleanupExpired',
          providerId: 'runtime-artifact-store',
          modelId: 'not-applicable',
          evidence: [{ kind: 'storage_error', message: 'manifest locked' }],
        }),
    });

    await expect(cleanupArtifactsForCli(runtime, new Date('2026-05-28T09:00:00.000Z')))
      .rejects.toThrow('manifest locked');
  });

  test('upserts and searches Runtime Services vectors through explicit storage commands', async () => {
    const calls: Array<{ capabilityId: string; input: unknown; consumer?: string }> = [];
    const runtime = runtimePortMock({
      'embedding.create': async (input, options) => {
        calls.push({ capabilityId: 'embedding.create', input, consumer: options?.consumer });
        return {
          status: 'ok',
          capabilityId: 'embedding.create',
          providerId: 'runtime-embedding-provider',
          modelId: 'runtime-embedding-model',
          evidence: [],
          embedding: [1, 0],
        };
      },
      'vector.upsert': async (input, options) => {
        calls.push({ capabilityId: 'vector.upsert', input, consumer: options?.consumer });
        return {
          status: 'ok',
          capabilityId: 'vector.upsert',
          providerId: 'runtime-vector-store',
          modelId: 'not-applicable',
          evidence: [],
          id: 'note-alpha',
        };
      },
      'vector.search': async (input, options) => {
        calls.push({ capabilityId: 'vector.search', input, consumer: options?.consumer });
        return {
          status: 'ok',
          capabilityId: 'vector.search',
          providerId: 'runtime-vector-store',
          modelId: 'not-applicable',
          evidence: [],
          results: [{
            id: 'note-alpha',
            content: 'alpha bridge note',
            score: 0.99,
            metadata: { sourceKind: 'operator_storage_cli' },
          }],
        };
      },
    });

    const upsertOutput = await upsertBridgeContentForCli(
      { id: 'note-alpha', content: 'alpha bridge note' },
      { runtime, tableName: 'tenant_alpha_vectors' },
    );
    const searchOutput = await searchBridgeContentForCli(
      { query: 'find alpha', limit: 1 },
      { runtime, tableName: 'tenant_alpha_vectors' },
    );

    expect(upsertOutput).toContain('Bridge runtime services vector upsert');
    expect(upsertOutput).toContain('tableName=tenant_alpha_vectors');
    expect(upsertOutput).toContain('id=note-alpha');
    expect(upsertOutput).toContain('dims=2');
    expect(searchOutput).toContain('Bridge runtime services vector search');
    expect(searchOutput).toContain('note-alpha');
    expect(searchOutput).toContain('alpha bridge note');
    expect(searchOutput).not.toContain('secret-value');
    expect(calls).toEqual([
      { capabilityId: 'embedding.create', input: { input: 'alpha bridge note' }, consumer: 'domain-agent' },
      {
        capabilityId: 'vector.upsert',
        input: {
          tableName: 'tenant_alpha_vectors',
          id: 'note-alpha',
          content: 'alpha bridge note',
          embedding: [1, 0],
          metadata: { sourceKind: 'operator_storage_cli' },
        },
        consumer: 'domain-agent',
      },
      {
        capabilityId: 'vector.search',
        input: {
          tableName: 'tenant_alpha_vectors',
          query: 'find alpha',
          limit: 1,
        },
        consumer: 'domain-agent',
      },
    ]);
  });

  test('does not report vector search failed envelopes as no matches', async () => {
    const runtime = runtimePortMock({
      'vector.search': async () => ({
        status: 'failed',
        capabilityId: 'vector.search',
        providerId: 'runtime-vector-store',
        modelId: 'not-applicable',
        evidence: [{ kind: 'query_error', message: 'index unavailable' }],
      }),
    });

    await expect(searchBridgeContentForCli(
      { query: 'find alpha', limit: 1 },
      { runtime, tableName: 'tenant_alpha_vectors' },
    )).rejects.toThrow('index unavailable');
  });
});
