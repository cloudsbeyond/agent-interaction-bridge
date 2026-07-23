import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const spawnState = vi.hoisted(() => ({
  calls: [] as Array<{ binary: string; args: string[]; options: { cwd?: string } }>,
  requests: [] as Array<{ method?: string; params?: Record<string, unknown> }>,
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn((binary: string, args: string[] = [], options: { cwd?: string } = {}) => {
    spawnState.calls.push({ binary, args, options });
    if (args[0] === '--version') {
      const child = new EventEmitter() as EventEmitter & { pid: number };
      child.pid = 100;
      process.nextTick(() => child.emit('exit', 0, null));
      return child;
    }

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
    child.pid = 101;
    child.exitCode = null;
    child.signalCode = null;
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        for (const line of String(chunk).split('\n').filter(Boolean)) {
          const message = JSON.parse(line) as { id?: string; method?: string; params?: Record<string, unknown> };
          spawnState.requests.push({ method: message.method, params: message.params });
          if (!message.id) continue;
          if (message.method === 'thread/start') {
            stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: 'thread_1' } } })}\n`);
          } else {
            stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          }
          if (message.method === 'turn/start') {
            stdout.write(`${JSON.stringify({
              method: 'turn/completed',
              params: {
                threadId: message.params?.threadId ?? 'thread_1',
                turn: { status: 'completed' },
              },
            })}\n`);
          }
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

import { buildCodexAppServerArgs, CodexAppServerAdapter } from './app-server-adapter';

describe('buildCodexAppServerArgs', () => {
  beforeEach(() => {
    spawnState.calls.length = 0;
    spawnState.requests.length = 0;
  });

  test('starts Codex app-server without bridge model-provider overrides', () => {
    expect(buildCodexAppServerArgs()).toEqual([
      'app-server',
      '--listen',
      'stdio://',
    ]);
  });

  test('starts the app-server process in a dedicated default cwd while keeping task cwd for thread start', async () => {
    const adapter = new CodexAppServerAdapter({ binary: 'codex', requestTimeoutMs: 50 });

    const events = [];
    for await (const event of adapter.run({ prompt: 'reply only: pong', cwd: '/tmp/task-workspace' }).events) {
      events.push(event);
    }

    const appServerSpawn = spawnState.calls.find((call) => call.args[0] === 'app-server');
    expect(appServerSpawn?.options.cwd).toBe(join(homedir(), 'Documents', 'Codex', 'app-server'));
    expect(spawnState.requests.find((request) => request.method === 'thread/start')?.params?.cwd).toBe(
      '/tmp/task-workspace',
    );
    expect(events[0]).toEqual({
      type: 'system',
      sessionId: 'thread_1',
      cwd: '/tmp/task-workspace',
    });
    expect(events).toContainEqual({ type: 'done', sessionId: 'thread_1' });
  });

  test('accepts a configured app-server cwd for the service process', async () => {
    const adapter = new CodexAppServerAdapter({
      binary: 'codex',
      requestTimeoutMs: 50,
      appServerCwd: '/tmp/custom-app-server',
    });

    for await (const _event of adapter.run({ prompt: 'reply only: pong', cwd: '/tmp/task-workspace' }).events) {
      // drain
    }

    const appServerSpawn = spawnState.calls.find((call) => call.args[0] === 'app-server');
    expect(appServerSpawn?.options.cwd).toBe('/tmp/custom-app-server');
  });

  test('confirms a resumed thread before exposing its turn notifications', async () => {
    const adapter = new CodexAppServerAdapter({ binary: 'codex', requestTimeoutMs: 50 });

    const events = [];
    for await (const event of adapter.run({
      prompt: 'continue',
      cwd: '/tmp/task-workspace',
      sessionId: 'thread_existing',
    }).events) {
      events.push(event);
    }

    expect(spawnState.requests.find((request) => request.method === 'thread/resume')?.params).toMatchObject({
      threadId: 'thread_existing',
      cwd: '/tmp/task-workspace',
    });
    expect(events[0]).toEqual({
      type: 'system',
      sessionId: 'thread_existing',
      cwd: '/tmp/task-workspace',
    });
    expect(events).toContainEqual({ type: 'done', sessionId: 'thread_existing' });
  });
});
