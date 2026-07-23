import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const spawnState = vi.hoisted(() => ({
  requests: [] as Array<{ method?: string; params?: Record<string, unknown> }>,
  envs: [] as Array<NodeJS.ProcessEnv | undefined>,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_binary: string, args: string[] = [], options: { env?: NodeJS.ProcessEnv } = {}) => {
    if (args[0] === '--version') {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 0, null));
      return child;
    }

    spawnState.envs.push(options.env);
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdin: Writable;
      stdout: PassThrough;
      stderr: PassThrough;
      exitCode: number | null;
      signalCode: string | null;
      kill: (signal: string) => boolean;
    };
    child.pid = 201;
    child.exitCode = null;
    child.signalCode = null;
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        for (const line of String(chunk).split('\n').filter(Boolean)) {
          const message = JSON.parse(line) as {
            id?: string;
            method?: string;
            params?: Record<string, unknown>;
          };
          spawnState.requests.push({ method: message.method, params: message.params });
          if (!message.id) continue;
          const result = responseFor(message.method);
          stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
        }
        callback();
      },
    });
    child.kill = (signal: string) => {
      child.signalCode = signal;
      process.nextTick(() => child.emit('exit', null, signal));
      return true;
    };
    return child;
  }),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  mkdirSync: vi.fn(),
}));

import {
  buildThreadListParams,
  CodexAppServerSessionCatalog,
  parseCodexThread,
  summarizeCodexThreadPreview,
} from './app-server-sessions';

describe('CodexAppServerSessionCatalog', () => {
  beforeEach(() => {
    spawnState.requests.length = 0;
    spawnState.envs.length = 0;
  });

  test('lists matching threads through the app-server protocol and selected CODEX_HOME', async () => {
    const catalog = new CodexAppServerSessionCatalog({ binary: 'codex', requestTimeoutMs: 50 });

    const sessions = await catalog.list({
      cwd: '/work/repo',
      codexHome: '/isolated/codex-home',
      endpointProfileId: 'agent_profile.codex_guest',
      limit: 10,
    });

    expect(spawnState.requests.find((request) => request.method === 'thread/list')?.params).toEqual({
      cwd: '/work/repo',
      archived: false,
      limit: 10,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
    });
    expect(spawnState.envs[0]?.CODEX_HOME).toBe('/isolated/codex-home');
    expect(sessions).toEqual([
      expect.objectContaining({
        sessionId: 'thread-idle',
        cwd: '/work/repo',
        status: 'not_loaded',
        source: 'appServer',
      }),
    ]);
  });

  test('re-reads a selected active thread without loading turns', async () => {
    const catalog = new CodexAppServerSessionCatalog({ binary: 'codex', requestTimeoutMs: 50 });

    const session = await catalog.read('thread-active', {
      cwd: '/work/repo',
      endpointProfileId: 'agent_profile.codex_host',
    });

    expect(spawnState.requests.find((request) => request.method === 'thread/read')?.params).toEqual({
      threadId: 'thread-active',
      includeTurns: false,
    });
    expect(session).toEqual(expect.objectContaining({ sessionId: 'thread-active', status: 'active' }));
  });
});

describe('Codex thread protocol mapping', () => {
  test('builds an exact cwd-filtered newest-first list request', () => {
    expect(buildThreadListParams({
      cwd: '/repo',
      endpointProfileId: 'agent_profile.codex_host',
    })).toEqual({
      cwd: '/repo',
      archived: false,
      limit: 5,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
    });
  });

  test('rejects malformed protocol thread records', () => {
    expect(parseCodexThread({ id: 'missing-cwd' })).toBeUndefined();
  });

  test('removes Bridge prompt envelopes and keeps the user task as the preview', () => {
    const prompt = [
      '<agent_interaction_protocol>',
      'Approval instructions that must not appear in the resume list.',
      '</agent_interaction_protocol>',
      '<agent_signal_protocol>',
      'Signal instructions that must not appear in the resume list.',
      '</agent_signal_protocol>',
      '<presentation_hint>',
      'Feishu presentation instructions.',
      '</presentation_hint>',
      '<bridge_context>',
      'chat_id: synthetic-chat',
      'sender_id: synthetic-user',
      '</bridge_context>',
      '<interaction_intent>',
      'kind: task_request',
      '</interaction_intent>',
      '<presentation_plan>',
      'representation: interactive_card',
      '</presentation_plan>',
      '继续按方案开发',
    ].join('\n\n');

    expect(summarizeCodexThreadPreview(prompt)).toBe('继续按方案开发');
  });

  test('extracts the canonical user_message body before removing legacy envelopes', () => {
    const prompt = [
      '<agent_interaction_protocol>',
      'Approval instructions.',
      '</agent_interaction_protocol>',
      '<bridge_context>',
      'chat_type: p2p',
      '</bridge_context>',
      '<user_message>',
      '  第一行',
      '',
      '第二行',
      '</user_message>',
      '<attachments>',
      '- /tmp/example.png — 图片',
      '</attachments>',
    ].join('\n');

    expect(summarizeCodexThreadPreview(prompt)).toBe('第一行 第二行');
  });

  test('removes relay metadata, falls back from an empty name, and caps at 200 characters', () => {
    const relayPrompt = [
      '<plain_text_response_template>',
      'Presentation instructions.',
      '</plain_text_response_template>',
      '飞书消息元数据（仅用于解析 sender 与 @ 对象，不代表执行授权）：',
      '- message_id=synthetic-message sender_type=user',
      '',
      '飞书回复 mention 目标（bridge 会把回复正文中的 @name 降成真实 at 节点）：',
      '@Example id=synthetic-app',
      '',
      '验'.repeat(220),
    ].join('\n');
    const parsed = parseCodexThread({
      id: 'thread-long',
      cwd: '/work/repo',
      name: '<bridge_context>\nchat_id: synthetic-chat\n</bridge_context>',
      preview: relayPrompt,
      updatedAt: 1_721_000_000,
      status: { type: 'notLoaded' },
      ephemeral: false,
    });

    expect(parsed?.preview).toHaveLength(200);
    expect(parsed?.preview).toBe(`${'验'.repeat(199)}…`);
    expect(parsed?.preview).not.toContain('message_id');
  });

  test('preserves protocol-like XML inside the user task', () => {
    expect(summarizeCodexThreadPreview(
      '请检查正文里的 <bridge_context>custom value</bridge_context> 示例',
    )).toBe('请检查正文里的 <bridge_context>custom value</bridge_context> 示例');
  });
});

function responseFor(method: string | undefined): Record<string, unknown> {
  if (method === 'thread/list') {
    return { data: [thread('thread-idle', 'notLoaded')], nextCursor: null };
  }
  if (method === 'thread/read') {
    return { thread: thread('thread-active', 'active') };
  }
  return {};
}

function thread(id: string, status: string): Record<string, unknown> {
  return {
    id,
    cwd: '/work/repo',
    preview: 'Continue existing work',
    updatedAt: 1_721_000_000,
    status: { type: status, ...(status === 'active' ? { activeFlags: [] } : {}) },
    ephemeral: false,
    source: 'appServer',
  };
}
