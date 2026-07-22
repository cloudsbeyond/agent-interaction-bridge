import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { AgentEvent } from '../types';
import { extractAgentSignals, stripAgentSignalBlocks } from '../../signal/protocol';

export type CodexProtocolId = string | number;

export interface CodexProtocolRequest<T = unknown> {
  id: CodexProtocolId;
  method: string;
  params?: T;
}

export interface CodexProtocolNotification<T = unknown> {
  method: string;
  params?: T;
}

export interface CodexProtocolResponse<T = unknown> {
  id: CodexProtocolId;
  result?: T;
  error?: {
    code?: string | number;
    message: string;
    data?: unknown;
  };
}

export interface CodexProtocolClientEvents {
  notification: [notification: CodexProtocolNotification];
  serverRequest: [request: CodexProtocolRequest];
  error: [error: Error];
  close: [];
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export interface CodexProtocolClientOptions {
  requestIdPrefix?: string;
  requestTimeoutMs?: number;
}

export declare interface CodexAppServerProtocolClient {
  on<K extends keyof CodexProtocolClientEvents>(
    event: K,
    listener: (...args: CodexProtocolClientEvents[K]) => void,
  ): this;
  off<K extends keyof CodexProtocolClientEvents>(
    event: K,
    listener: (...args: CodexProtocolClientEvents[K]) => void,
  ): this;
  emit<K extends keyof CodexProtocolClientEvents>(
    event: K,
    ...args: CodexProtocolClientEvents[K]
  ): boolean;
}

export class CodexAppServerProtocolClient extends EventEmitter {
  private readonly pending = new Map<CodexProtocolId, PendingRequest>();
  private readonly requestIdPrefix: string;
  private readonly requestTimeoutMs: number;
  private nextId = 1;
  private started = false;
  private closed = false;

  constructor(
    private readonly readable: Readable,
    private readonly writable: Writable,
    options: CodexProtocolClientOptions = {},
  ) {
    super();
    this.requestIdPrefix = options.requestIdPrefix ?? 'aib';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.readLoop().catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failAll(err);
      this.emit('error', err);
    });
  }

  request<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams,
    options: { timeoutMs?: number } = {},
  ): Promise<TResult> {
    if (this.closed) {
      return Promise.reject(new Error('Codex app-server protocol is closed'));
    }
    const id = `${this.requestIdPrefix}-${this.nextId++}`;
    const message = params === undefined ? { id, method } : { id, method, params };
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`Timed out waiting for Codex app-server response to ${method}`));
            }, timeoutMs)
          : undefined;
      this.pending.set(id, { method, resolve, reject, timer });
    });
    this.writeJson(message);
    return promise as Promise<TResult>;
  }

  notify<TParams = unknown>(method: string, params?: TParams): void {
    this.writeJson(params === undefined ? { method } : { method, params });
  }

  respondError(id: CodexProtocolId, message: string): void {
    this.writeJson({
      id,
      error: {
        code: 'AGENT_INTERACTION_BRIDGE_UNSUPPORTED_SERVER_REQUEST',
        message,
      },
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.writable.end();
    this.failAll(new Error('Codex app-server protocol closed'));
  }

  private async readLoop(): Promise<void> {
    const rl = createInterface({ input: this.readable, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleMessage(JSON.parse(trimmed) as unknown);
      }
    } finally {
      this.closed = true;
      this.failAll(new Error('Codex app-server protocol stream ended'));
      this.emit('close');
      rl.close();
    }
  }

  private handleMessage(message: unknown): void {
    if (isResponse(message)) {
      this.handleResponse(message);
      return;
    }
    if (isRequest(message)) {
      this.emit('serverRequest', message);
      return;
    }
    if (isNotification(message)) {
      this.emit('notification', message);
    }
  }

  private handleResponse(message: CodexProtocolResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }
    pending.resolve(message.result);
  }

  private writeJson(value: unknown): void {
    this.writable.write(`${JSON.stringify(value)}\n`);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export interface InitializeParams {
  clientInfo: {
    name: string;
    title: string | null;
    version: string;
  };
  capabilities: {
    experimentalApi: boolean;
    optOutNotificationMethods: string[] | null;
  };
}

export function buildInitializeParams(version: string): InitializeParams {
  return {
    clientInfo: {
      name: 'agent-interaction-bridge',
      title: 'Agent-Interaction-Bridge',
      version,
    },
    capabilities: {
      experimentalApi: true,
      optOutNotificationMethods: null,
    },
  };
}

interface CodexRuntimePolicyInput {
  cwd: string;
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
}

export function buildThreadStartParams(input: CodexRuntimePolicyInput): Record<string, unknown> {
  return {
    cwd: input.cwd,
    approvalPolicy: input.approvalPolicy ?? 'never',
    sandbox: input.sandboxMode ?? 'danger-full-access',
    dynamicTools: [],
  };
}

export function buildThreadResumeParams(input: {
  threadId: string;
} & CodexRuntimePolicyInput): Record<string, unknown> {
  return {
    threadId: input.threadId,
    cwd: input.cwd,
    approvalPolicy: input.approvalPolicy ?? 'never',
    sandbox: input.sandboxMode ?? 'danger-full-access',
  };
}

export function buildTurnStartParams(input: {
  threadId: string;
  prompt: string;
} & CodexRuntimePolicyInput): Record<string, unknown> {
  return {
    threadId: input.threadId,
    cwd: input.cwd,
    approvalPolicy: input.approvalPolicy ?? 'never',
    sandboxPolicy: sandboxPolicyFor(input.sandboxMode ?? 'danger-full-access', input.cwd),
    input: [{ type: 'text', text: input.prompt, text_elements: [] }],
  };
}

export function buildTurnInterruptParams(input: {
  threadId: string;
  turnId: string;
}): Record<string, unknown> {
  return {
    threadId: input.threadId,
    turnId: input.turnId,
  };
}

function sandboxPolicyFor(
  mode: NonNullable<CodexRuntimePolicyInput['sandboxMode']>,
  cwd: string,
): Record<string, unknown> {
  if (mode === 'read-only') {
    return { type: 'readOnly', networkAccess: false };
  }
  if (mode === 'workspace-write') {
    return { type: 'workspaceWrite', networkAccess: false, writableRoots: [cwd] };
  }
  return { type: 'dangerFullAccess' };
}

export function* translateAppServerNotification(
  notification: CodexProtocolNotification,
): Generator<AgentEvent> {
  const params = asRecord(notification.params);

  if (notification.method === 'thread/started') {
    const thread = asRecord(params.thread);
    const id = stringValue(thread.id) ?? stringValue(thread.sessionId);
    if (id) yield { type: 'system', sessionId: id };
    return;
  }

  if (notification.method === 'item/agentMessage/delta') {
    const delta = stringValue(params.delta);
    if (delta) yield { type: 'text', delta };
    return;
  }

  if (notification.method === 'item/completed') {
    yield* translateCompletedItem(params);
    return;
  }

  if (notification.method === 'thread/tokenUsage/updated') {
    const total = asRecord(asRecord(params.tokenUsage).total);
    const inputTokens = numberValue(total.inputTokens, total.input_tokens);
    const outputTokens = numberValue(total.outputTokens, total.output_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      yield { type: 'usage', inputTokens, outputTokens };
    }
    return;
  }

  if (notification.method === 'turn/completed') {
    const threadId = stringValue(params.threadId);
    const turn = asRecord(params.turn);
    const status = stringValue(turn.status);
    const error = turn.error;
    if (status && status !== 'completed' && status !== 'cancelled') {
      yield { type: 'error', message: `Codex turn ended with status ${status}` };
    }
    if (error) {
      yield { type: 'error', message: `Codex turn failed: ${JSON.stringify(error).slice(0, 500)}` };
    }
    yield { type: 'done', sessionId: threadId };
  }
}

function* translateCompletedItem(params: Record<string, unknown>): Generator<AgentEvent> {
  const item = asRecord(params.item);
  const itemType = stringValue(item.type);
  if (itemType === 'agentMessage' || itemType === 'agent_message') {
    const text = stringValue(item.text, item.message, item.content);
    if (text) {
      for (const signal of extractAgentSignals(text)) {
        yield { type: 'signal', signal };
      }
      const visible = stripAgentSignalBlocks(text);
      if (visible) yield { type: 'text_replace', text: visible };
    }
    return;
  }

  if (itemType === 'commandExecution' || itemType === 'command_execution') {
    const id = stringValue(item.id);
    if (!id) return;
    yield {
      type: 'tool_result',
      id,
      output: stringValue(item.aggregatedOutput, item.aggregated_output, item.output) ?? '',
      isError: numberValue(item.exitCode, item.exit_code) !== 0,
    };
  }
}

function isResponse(value: unknown): value is CodexProtocolResponse {
  return isRecord(value) && 'id' in value && ('result' in value || 'error' in value);
}

function isRequest(value: unknown): value is CodexProtocolRequest {
  return isRecord(value) && 'id' in value && typeof value.method === 'string';
}

function isNotification(value: unknown): value is CodexProtocolNotification {
  return isRecord(value) && !('id' in value) && typeof value.method === 'string';
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

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}
