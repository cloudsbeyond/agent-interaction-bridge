import { mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ProactiveCorrelationStore } from './correlation-store';

describe('ProactiveCorrelationStore', () => {
  test('persists bounded correlation and resolves only matching chat/profile/message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-correlation-'));
    const path = join(dir, 'correlations.json');
    let id = 0;
    const store = new ProactiveCorrelationStore({
      path,
      createId: () => `id-${++id}`,
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });
    const reserved = await store.reserve({
      signalId: 'signal-1',
      signalKind: 'status',
      chatId: 'chat-1',
      scope: 'chat-1:thread-1',
      sessionId: 'session-1',
      agentRuntimeId: 'agent_runtime.codex_app_server',
      endpointProfileId: 'agent_profile.codex_host',
      cwd: '/work',
      contextVersion: 'adapter-v1',
      originMessageId: 'human-message-1',
    });
    await store.markDelivered(reserved.record.correlationId, 'carrier-message-1');

    expect(store.resolveReply({
      chatId: 'chat-1',
      candidateMessageIds: ['carrier-message-1'],
      endpointProfileId: 'agent_profile.codex_host',
    })).toMatchObject({
      scope: 'chat-1:thread-1',
      sessionId: 'session-1',
      carrierMessageId: 'carrier-message-1',
      status: 'delivered',
    });
    expect(store.resolveReply({
      chatId: 'chat-2',
      candidateMessageIds: ['carrier-message-1'],
      endpointProfileId: 'agent_profile.codex_host',
    })).toBeUndefined();
    expect(store.findReplyCandidate({
      chatId: 'chat-1',
      candidateMessageIds: ['carrier-message-1'],
    })).toMatchObject({ endpointProfileId: 'agent_profile.codex_host' });
    expect(store.resolveReply({
      chatId: 'chat-1',
      candidateMessageIds: ['carrier-message-1'],
      endpointProfileId: 'agent_profile.guest',
    })).toBeUndefined();

    const stat = await readFile(path, 'utf8');
    expect(stat).toContain('carrier-message-1');
  });

  test('deduplicates retries by scope, session, and stable signal id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-correlation-'));
    const store = new ProactiveCorrelationStore({
      path: join(dir, 'correlations.json'),
      createId: () => 'correlation-1',
    });
    const input = {
      signalId: 'signal-1',
      signalKind: 'status' as const,
      chatId: 'chat-1',
      scope: 'chat-1',
      sessionId: 'session-1',
      agentRuntimeId: 'agent_runtime.codex_cli',
      endpointProfileId: 'agent_profile.codex_host',
      cwd: '/work',
      contextVersion: 'adapter-v1',
    };
    const first = await store.reserve(input);
    const second = await store.reserve(input);
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ record: first.record, duplicate: true });
  });

  test('drops expired records on load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-correlation-'));
    const path = join(dir, 'correlations.json');
    const initial = new ProactiveCorrelationStore({
      path,
      createId: () => 'correlation-1',
      now: () => new Date('2026-07-01T00:00:00.000Z'),
      ttlMs: 1_000,
    });
    await initial.reserve({
      signalId: 'signal-1',
      signalKind: 'status',
      chatId: 'chat-1',
      scope: 'chat-1',
      sessionId: 'session-1',
      agentRuntimeId: 'runtime-1',
      endpointProfileId: 'profile-1',
      cwd: '/work',
      contextVersion: 'v1',
    });

    const reloaded = new ProactiveCorrelationStore({
      path,
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });
    await reloaded.load();
    expect(reloaded.get('correlation-1')).toBeUndefined();
  });

  test('does not expose an unpersisted delivery as resumable correlation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-correlation-'));
    const moved = `${dir}-moved`;
    const path = join(dir, 'correlations.json');
    const store = new ProactiveCorrelationStore({
      path,
      createId: () => 'correlation-1',
    });
    const reserved = await store.reserve({
      signalId: 'signal-1',
      signalKind: 'status',
      chatId: 'chat-1',
      scope: 'chat-1',
      sessionId: 'session-1',
      agentRuntimeId: 'runtime-1',
      endpointProfileId: 'profile-1',
      cwd: '/work',
      contextVersion: 'v1',
    });
    await rename(dir, moved);
    await writeFile(dir, 'blocks directory recreation');

    await expect(store.markDelivered(
      reserved.record.correlationId,
      'carrier-message-1',
    )).rejects.toThrow();
    const rolledBack = store.get(reserved.record.correlationId);
    expect(rolledBack).toMatchObject({ status: 'pending' });
    expect(rolledBack).not.toHaveProperty('carrierMessageId');
  });
});
