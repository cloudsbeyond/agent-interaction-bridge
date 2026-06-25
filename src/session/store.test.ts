import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { agentSessionContextVersion } from './context-version';
import { SessionStore } from './store';

describe('SessionStore', () => {
  test('does not resume legacy sessions for an explicit runtime boundary', async () => {
    const file = await tempSessionFile();
    await writeFile(
      file,
      JSON.stringify({
        chat1: {
          sessionId: 'legacy-session',
          cwd: '/work',
          updatedAt: Date.now(),
        },
      }),
      'utf8',
    );

    const store = new SessionStore(file);
    await store.load();

    expect(store.resumeFor('chat1', '/work')).toBe('legacy-session');
    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server')).toBeUndefined();
  });

  test('resumes only sessions recorded for the same runtime boundary', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.set('chat1', 'thread-app-server', '/work', 'agent_runtime.codex_app_server');
    await store.flush();

    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server')).toBe(
      'thread-app-server',
    );
    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_cli')).toBeUndefined();

    const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    expect(persisted.chat1).toMatchObject({
      sessionId: 'thread-app-server',
      cwd: '/work',
      agentRuntimeId: 'agent_runtime.codex_app_server',
    });
  });

  test('does not resume sessions from a different prompt context version', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.set('chat1', 'thread-app-server', '/work', 'agent_runtime.codex_app_server', 'v1');
    await store.flush();

    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server', 'v1')).toBe(
      'thread-app-server',
    );
    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server', 'v2')).toBeUndefined();

    const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    expect(persisted.chat1).toMatchObject({
      sessionId: 'thread-app-server',
      contextVersion: 'v1',
    });
  });

  test('does not resume a Codex session created by another gateway mode', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.set(
      'chat1',
      'adapter-thread',
      '/work',
      'agent_runtime.codex_app_server',
      agentSessionContextVersion('adapter'),
    );
    await store.flush();

    expect(store.resumeFor(
      'chat1',
      '/work',
      'agent_runtime.codex_app_server',
      agentSessionContextVersion('adapter'),
    )).toBe('adapter-thread');
    expect(store.resumeFor(
      'chat1',
      '/work',
      'agent_runtime.codex_app_server',
      agentSessionContextVersion('relay'),
    )).toBeUndefined();
  });

  test('does not resume legacy sessions when a prompt context version is required', async () => {
    const file = await tempSessionFile();
    await writeFile(
      file,
      JSON.stringify({
        chat1: {
          sessionId: 'legacy-session',
          cwd: '/work',
          agentRuntimeId: 'agent_runtime.codex_app_server',
          updatedAt: Date.now(),
        },
      }),
      'utf8',
    );

    const store = new SessionStore(file);
    await store.load();

    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server')).toBe(
      'legacy-session',
    );
    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server', 'v2')).toBeUndefined();
  });

  test('persists per-scope gateway mode without requiring a resumable session', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.setGatewayMode('chat1', 'relay');
    await store.flush();

    const reloaded = new SessionStore(file);
    await reloaded.load();

    expect(reloaded.getGatewayMode('chat1')).toBe('relay');
    expect(reloaded.resumeFor('chat1', '/work')).toBeUndefined();
  });

  test('preserves gateway mode across run session updates until /new clears the scope', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.setGatewayMode('chat1', 'relay');
    store.set('chat1', 'session-1', '/work', 'agent_runtime.codex_app_server');

    expect(store.getGatewayMode('chat1')).toBe('relay');
    expect(store.resumeFor('chat1', '/work', 'agent_runtime.codex_app_server')).toBe('session-1');

    store.clear('chat1');
    expect(store.getGatewayMode('chat1')).toBeUndefined();
  });

  test('clears resumable Codex session while preserving scope preferences', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.setGatewayMode('chat1', 'relay');
    store.setIdleTimeoutMinutes('chat1', 5);
    store.set(
      'chat1',
      'session-1',
      '/work',
      'agent_runtime.codex_app_server',
      agentSessionContextVersion('relay'),
    );

    expect(store.clearResumableSession('chat1')).toBe(true);
    expect(store.getGatewayMode('chat1')).toBe('relay');
    expect(store.getIdleTimeoutMinutes('chat1')).toBe(5);
    expect(store.resumeFor(
      'chat1',
      '/work',
      'agent_runtime.codex_app_server',
      agentSessionContextVersion('relay'),
    )).toBeUndefined();
  });

  test('persists turn trace predecessor separately from resumable Codex session', async () => {
    const file = await tempSessionFile();
    const store = new SessionStore(file);

    store.setTurnTraceArtifactId('chat1', 'artifact-1');
    store.set('chat1', 'session-1', '/work', 'agent_runtime.codex_app_server');

    expect(store.getTurnTraceArtifactId('chat1')).toBe('artifact-1');
    expect(store.clearResumableSession('chat1')).toBe(true);
    expect(store.getTurnTraceArtifactId('chat1')).toBe('artifact-1');

    await store.flush();
    const reloaded = new SessionStore(file);
    await reloaded.load();
    expect(reloaded.getTurnTraceArtifactId('chat1')).toBe('artifact-1');

    reloaded.clear('chat1');
    expect(reloaded.getTurnTraceArtifactId('chat1')).toBeUndefined();
  });

  test('ignores invalid or legacy gateway mode values while preserving resumable session data', async () => {
    const file = await tempSessionFile();
    await writeFile(
      file,
      JSON.stringify({
        chat1: {
          sessionId: 'session-1',
          cwd: '/work',
          updatedAt: Date.now(),
          gatewayMode: 'transparent_proxy',
        },
        chat2: {
          updatedAt: Date.now(),
          gatewayMode: 'relay',
        },
      }),
      'utf8',
    );

    const store = new SessionStore(file);
    await store.load();

    expect(store.resumeFor('chat1', '/work')).toBe('session-1');
    expect(store.getGatewayMode('chat1')).toBeUndefined();
    expect(store.getGatewayMode('chat2')).toBe('relay');
  });
});

async function tempSessionFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aib-session-store-'));
  return join(dir, 'sessions.json');
}
