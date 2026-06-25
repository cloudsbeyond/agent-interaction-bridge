import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import pkg from '../../../package.json';
import { log } from '../../core/logger';
import type { AgentAdapter, AgentEvent, AgentRun, AgentRunOptions } from '../types';
import { buildCodexEnv, codexBinaryCandidates } from './adapter';
import {
  buildInitializeParams,
  buildThreadResumeParams,
  buildThreadStartParams,
  buildTurnInterruptParams,
  buildTurnStartParams,
  CodexAppServerProtocolClient,
  type CodexProtocolNotification,
  type CodexProtocolRequest,
} from './app-server-protocol';
import { translateAppServerNotification } from './app-server-protocol';

type CodexAppServerChild = ChildProcessByStdio<Writable, Readable, Readable>;

export interface CodexAppServerAdapterOptions {
  binary?: string;
  codexHome?: string;
  appServerCwd?: string;
  requestTimeoutMs?: number;
  stopGraceMs?: number;
}

export class CodexAppServerAdapter implements AgentAdapter {
  readonly id = 'agent_runtime.codex_app_server';
  readonly displayName = 'Codex App Server';

  private readonly binary: string;
  private resolvedBinary?: string;

  constructor(private readonly options: CodexAppServerAdapterOptions = {}) {
    this.binary = options.binary ?? 'codex';
  }

  async isAvailable(): Promise<boolean> {
    for (const candidate of codexBinaryCandidates(this.binary)) {
      if (await canRunCodex(candidate)) {
        this.resolvedBinary = candidate;
        return true;
      }
    }
    return false;
  }

  run(opts: AgentRunOptions): AgentRun {
    const runner = new CodexAppServerRun(this.resolvedBinary ?? this.binary, {
      ...this.options,
      run: opts,
    });
    return {
      get pid() {
        return runner.pid;
      },
      events: runner.events(),
      stop: () => runner.stop(),
      waitForExit: (timeoutMs) => runner.waitForExit(timeoutMs),
    };
  }
}

class CodexAppServerRun {
  private child?: CodexAppServerChild;
  private protocol?: CodexAppServerProtocolClient;
  private threadId?: string;
  private turnId?: string;
  private stopped = false;

  constructor(
    private readonly binary: string,
    private readonly options: CodexAppServerAdapterOptions & { run: AgentRunOptions },
  ) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async *events(): AsyncGenerator<AgentEvent> {
    const queue = new AsyncEventQueue<AgentEvent>();
    try {
      const protocol = await this.startProtocol();
      const onNotification = (notification: CodexProtocolNotification): void => {
        for (const event of translateAppServerNotification(notification)) {
          queue.push(event);
        }
        if (notification.method === 'turn/started') {
          const turn = asRecord(asRecord(notification.params).turn);
          this.turnId = stringValue(turn.id);
        }
        if (notification.method === 'turn/completed') {
          queue.close();
        }
      };
      const onServerRequest = (request: CodexProtocolRequest): void => {
        protocol.respondError(request.id, `Unsupported Codex app-server request: ${request.method}`);
      };
      const onError = (error: Error): void => {
        queue.push({ type: 'error', message: error.message });
        queue.close();
      };

      protocol.on('notification', onNotification);
      protocol.on('serverRequest', onServerRequest);
      protocol.on('error', onError);
      try {
        this.threadId = await this.ensureThread(protocol);
        await protocol.request(
          'turn/start',
          buildTurnStartParams({
            threadId: this.threadId,
            cwd: this.options.run.cwd ?? process.cwd(),
            prompt: this.options.run.prompt,
            approvalPolicy: this.options.run.approvalPolicy,
            sandboxMode: this.options.run.sandboxMode,
          }),
        );
        yield* queue;
      } finally {
        protocol.off('notification', onNotification);
        protocol.off('serverRequest', onServerRequest);
        protocol.off('error', onError);
      }
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.shutdownChild();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const protocol = this.protocol;
    const threadId = this.threadId;
    const turnId = this.turnId;
    if (protocol && threadId && turnId) {
      await protocol
        .request('turn/interrupt', buildTurnInterruptParams({ threadId, turnId }), {
          timeoutMs: 5_000,
        })
        .catch(() => undefined);
    }
    await this.shutdownChild();
  }

  waitForExit(timeoutMs: number): Promise<boolean> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const onExit = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        child.off('exit', onExit);
        resolve(false);
      }, timeoutMs);
      child.once('exit', onExit);
    });
  }

  private async startProtocol(): Promise<CodexAppServerProtocolClient> {
    const binary = await this.resolveBinary();
    const codexHome = this.options.run.codexHome ?? this.options.codexHome;
    const env = buildCodexEnv({ ...this.options.run, codexHome });
    const appServerCwd = this.options.appServerCwd ?? defaultCodexAppServerCwd();
    mkdirSync(appServerCwd, { recursive: true });
    const child = spawn(binary, buildCodexAppServerArgs(), {
      cwd: appServerCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (chunk.trim()) log.warn('agent', 'app-server-stderr', { line: chunk.trim().slice(0, 500) });
    });
    child.on('exit', (code, signal) => {
      log.info('agent', 'app-server-exit', { pid: child.pid ?? null, code, signal });
    });
    const protocol = new CodexAppServerProtocolClient(child.stdout, child.stdin, {
      requestTimeoutMs: this.options.requestTimeoutMs,
      requestIdPrefix: `aib-${process.pid}`,
    });
    this.protocol = protocol;
    protocol.start();
    await protocol.request('initialize', buildInitializeParams(pkg.version));
    protocol.notify('initialized');
    return protocol;
  }

  private async ensureThread(protocol: CodexAppServerProtocolClient): Promise<string> {
    const cwd = this.options.run.cwd ?? process.cwd();
    if (this.options.run.sessionId) {
      await protocol.request(
        'thread/resume',
        buildThreadResumeParams({
          threadId: this.options.run.sessionId,
          cwd,
          approvalPolicy: this.options.run.approvalPolicy,
          sandboxMode: this.options.run.sandboxMode,
        }),
      );
      return this.options.run.sessionId;
    }
    const response = await protocol.request(
      'thread/start',
      buildThreadStartParams({
        cwd,
        approvalPolicy: this.options.run.approvalPolicy,
        sandboxMode: this.options.run.sandboxMode,
      }),
    );
    const thread = asRecord(asRecord(response).thread);
    const threadId = stringValue(thread.id, thread.sessionId);
    if (!threadId) throw new Error('Codex app-server thread/start returned no thread id');
    return threadId;
  }

  private async resolveBinary(): Promise<string> {
    for (const candidate of codexBinaryCandidates(this.binary)) {
      if (await canRunCodex(candidate)) return candidate;
    }
    return this.binary;
  }

  private async shutdownChild(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.protocol?.close();
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const exited = await this.waitForExit(this.options.stopGraceMs ?? this.options.run.stopGraceMs ?? 5_000);
    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    if (this.stopped) {
      log.info('agent', 'app-server-stopped', { pid: child.pid ?? null });
    }
  }
}

function defaultCodexAppServerCwd(): string {
  return join(homedir(), 'Documents', 'Codex', 'app-server');
}

export function buildCodexAppServerArgs(): string[] {
  return [
    'app-server',
    '--listen',
    'stdio://',
  ];
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(next: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as T, done: true });
        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

function canRunCodex(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
}
