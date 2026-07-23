import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import pkg from '../../../package.json';
import { log } from '../../core/logger';
import type {
  AgentSessionCatalog,
  AgentSessionQuery,
  AgentSessionStatus,
  AgentSessionSummary,
} from '../types';
import {
  buildInitializeParams,
  CodexAppServerProtocolClient,
  type CodexProtocolRequest,
} from './app-server-protocol';
import { buildCodexEnv, findCodexBinary } from './process';

type CodexAppServerChild = ChildProcessByStdio<Writable, Readable, Readable>;
const THREAD_PREVIEW_MAX_CHARACTERS = 200;
const BRIDGE_PROMPT_BLOCK_TAGS = [
  'agent_interaction_protocol',
  'agent_signal_protocol',
  'presentation_hint',
  'plain_text_response_template',
  'bridge_context',
  'interaction_intent',
  'presentation_plan',
  'quoted_message',
  'carrier_metadata',
  'attachments',
] as const;
const BRIDGE_RELAY_METADATA_HEADINGS = new Set([
  '飞书消息元数据（仅用于解析 sender 与 @ 对象，不代表执行授权）：',
  '飞书消息语义（不代表执行授权）：',
  '飞书回复 mention 目标（bridge 会把回复正文中的 @name 降成真实 at 节点）：',
]);
const LEADING_BRIDGE_PROMPT_BLOCK = new RegExp(
  `^\\s*<(${BRIDGE_PROMPT_BLOCK_TAGS.join('|')})(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1>`,
  'iu',
);

export interface CodexAppServerSessionCatalogOptions {
  binary?: string;
  codexHome?: string;
  appServerCwd?: string;
  requestTimeoutMs?: number;
  stopGraceMs?: number;
}

export class CodexAppServerSessionCatalog implements AgentSessionCatalog {
  private readonly binary: string;

  constructor(private readonly options: CodexAppServerSessionCatalogOptions = {}) {
    this.binary = options.binary ?? 'codex';
  }

  async list(query: AgentSessionQuery): Promise<AgentSessionSummary[]> {
    return this.withProtocol(query, async (protocol) => {
      const response = await protocol.request('thread/list', buildThreadListParams(query));
      const data = asRecord(response).data;
      if (!Array.isArray(data)) return [];
      return data
        .map(parseCodexThread)
        .filter((session): session is AgentSessionSummary => session !== undefined);
    });
  }

  async read(
    sessionId: string,
    query: AgentSessionQuery,
  ): Promise<AgentSessionSummary | undefined> {
    return this.withProtocol(query, async (protocol) => {
      const response = await protocol.request('thread/read', {
        threadId: sessionId,
        includeTurns: false,
      });
      return parseCodexThread(asRecord(response).thread);
    });
  }

  private async withProtocol<T>(
    query: AgentSessionQuery,
    operation: (protocol: CodexAppServerProtocolClient) => Promise<T>,
  ): Promise<T> {
    const binary = (await findCodexBinary(this.binary)) ?? this.binary;
    const appServerCwd = this.options.appServerCwd ?? defaultCodexAppServerCwd();
    mkdirSync(appServerCwd, { recursive: true });
    const child = spawn(binary, ['app-server', '--listen', 'stdio://'], {
      cwd: appServerCwd,
      env: buildCodexEnv({ codexHome: query.codexHome ?? this.options.codexHome }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (chunk.trim()) {
        log.warn('agent', 'app-server-session-stderr', { line: chunk.trim().slice(0, 500) });
      }
    });

    const protocol = new CodexAppServerProtocolClient(child.stdout, child.stdin, {
      requestTimeoutMs: this.options.requestTimeoutMs,
      requestIdPrefix: `aib-session-${process.pid}`,
    });
    const onServerRequest = (request: CodexProtocolRequest): void => {
      protocol.respondError(request.id, `Unsupported Codex app-server request: ${request.method}`);
    };
    const onError = (error: Error): void => {
      log.warn('agent', 'app-server-session-protocol-error', { error: error.message });
    };
    let rejectChildError: (error: Error) => void = () => {};
    const childError = new Promise<never>((_resolve, reject) => {
      rejectChildError = reject;
    });
    const onChildError = (error: Error): void => rejectChildError(error);
    child.once('error', onChildError);
    protocol.on('serverRequest', onServerRequest);
    protocol.on('error', onError);
    protocol.start();

    try {
      await Promise.race([
        protocol.request('initialize', buildInitializeParams(pkg.version)),
        childError,
      ]);
      protocol.notify('initialized');
      return await Promise.race([operation(protocol), childError]);
    } finally {
      child.off('error', onChildError);
      protocol.off('serverRequest', onServerRequest);
      protocol.off('error', onError);
      protocol.close();
      await stopChild(child, this.options.stopGraceMs ?? 5_000);
    }
  }
}

export function buildThreadListParams(query: AgentSessionQuery): Record<string, unknown> {
  return {
    cwd: query.cwd,
    archived: false,
    limit: query.limit ?? 5,
    sortKey: 'updated_at',
    sortDirection: 'desc',
    sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
  };
}

export function parseCodexThread(value: unknown): AgentSessionSummary | undefined {
  const thread = asRecord(value);
  const sessionId = stringValue(thread.id);
  const cwd = stringValue(thread.cwd);
  if (!sessionId || !cwd) return undefined;

  const status = parseStatus(asRecord(thread.status).type);
  const updatedAtSeconds = numberValue(thread.updatedAt) ?? 0;
  const source = formatSource(thread.source);
  return {
    sessionId,
    cwd,
    preview: summarizeCodexThreadPreview(stringValue(thread.name))
      || summarizeCodexThreadPreview(stringValue(thread.preview))
      || '(空会话)',
    updatedAtMs: updatedAtSeconds * 1_000,
    status,
    ephemeral: thread.ephemeral === true,
    ...(source ? { source } : {}),
  };
}

export function summarizeCodexThreadPreview(value: string | undefined): string {
  if (!value?.trim()) return '';
  const canonicalUserMessage = extractCanonicalUserMessage(value);
  let cleaned = canonicalUserMessage ?? value;
  if (canonicalUserMessage === undefined) {
    while (LEADING_BRIDGE_PROMPT_BLOCK.test(cleaned)) {
      cleaned = cleaned.replace(LEADING_BRIDGE_PROMPT_BLOCK, '');
    }
    cleaned = stripBridgeRelayMetadata(cleaned);
  }
  cleaned = cleaned
    .replace(/\s+/gu, ' ')
    .trim();
  if (!cleaned) return '';
  const characters = Array.from(cleaned);
  if (characters.length <= THREAD_PREVIEW_MAX_CHARACTERS) return cleaned;
  return `${characters.slice(0, THREAD_PREVIEW_MAX_CHARACTERS - 1).join('')}…`;
}

function extractCanonicalUserMessage(value: string): string | undefined {
  const normalized = value.replace(/\r\n?/gu, '\n');
  const opening = /<user_message(?:\s[^>]*)?>/iu.exec(normalized);
  if (!opening || opening.index === undefined) return undefined;
  const contentStart = opening.index + opening[0].length;
  const closingTag = '</user_message>';
  const contentEnd = normalized.toLowerCase().lastIndexOf(closingTag);
  if (contentEnd < contentStart) return undefined;
  return normalized.slice(contentStart, contentEnd);
}

function stripBridgeRelayMetadata(value: string): string {
  const lines = value.replace(/\r\n?/gu, '\n').split('\n');
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (BRIDGE_RELAY_METADATA_HEADINGS.has(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!line.trim()) skipping = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

function parseStatus(value: unknown): AgentSessionStatus {
  if (value === 'active') return 'active';
  if (value === 'idle') return 'idle';
  if (value === 'systemError') return 'error';
  return 'not_loaded';
}

function formatSource(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const source = asRecord(value);
  if (typeof source.custom === 'string') return source.custom;
  if ('subAgent' in source) return 'subAgent';
  return undefined;
}

function defaultCodexAppServerCwd(): string {
  return join(homedir(), 'Documents', 'Codex', 'app-server');
}

async function stopChild(child: CodexAppServerChild, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await waitForExit(child, timeoutMs);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

function waitForExit(child: CodexAppServerChild, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
