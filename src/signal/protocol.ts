import type { AgentSignal, AgentSignalKind, SignalSeverity } from './router';

export const AGENT_SIGNAL_BLOCK_START = '<agent_signal>';
export const AGENT_SIGNAL_BLOCK_END = '</agent_signal>';

const MAX_SIGNAL_BLOCK_CHARS = 32_768;
const MAX_ID_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_SUMMARY_CHARS = 8_000;
const MAX_DETAIL_CHARS = 4_000;

const SIGNAL_KINDS = new Set<AgentSignalKind>([
  'progress',
  'risk_approval',
  'choice',
  'artifact_preview',
  'patch_preview',
  'test_report',
  'status',
  'final_result',
]);

const SEVERITIES = new Set<SignalSeverity>(['info', 'warning', 'danger']);
const FORBIDDEN_ROUTING_FIELDS = [
  'chatId',
  'chat_id',
  'scope',
  'sessionId',
  'session_id',
  'endpointProfileId',
  'endpoint_profile_id',
  'carrier',
] as const;

export interface DecodedAgentSignalText {
  text: string;
  signals: AgentSignal[];
}

export function encodeAgentSignalBlock(signal: AgentSignal): string {
  return `${AGENT_SIGNAL_BLOCK_START}\n${JSON.stringify({ agent_signal: signal })}\n${AGENT_SIGNAL_BLOCK_END}`;
}

export function decodeAgentSignalBlock(body: string): AgentSignal | undefined {
  if (body.length > MAX_SIGNAL_BLOCK_CHARS) return undefined;
  try {
    const parsed = JSON.parse(body) as { agent_signal?: unknown };
    return normalizeProactiveAgentSignal(parsed.agent_signal);
  } catch {
    return undefined;
  }
}

export function extractAgentSignals(text: string): AgentSignal[] {
  const signals: AgentSignal[] = [];
  for (const body of signalBlockBodies(text)) {
    const signal = decodeAgentSignalBlock(body);
    if (signal) signals.push(signal);
  }
  return signals;
}

export function stripAgentSignalBlocks(text: string): string {
  if (!text.includes(AGENT_SIGNAL_BLOCK_START)) return text;
  let remaining = text;
  let output = '';
  while (remaining) {
    const start = remaining.indexOf(AGENT_SIGNAL_BLOCK_START);
    if (start < 0) {
      output += remaining;
      break;
    }
    output += remaining.slice(0, start);
    const bodyStart = start + AGENT_SIGNAL_BLOCK_START.length;
    const end = remaining.indexOf(AGENT_SIGNAL_BLOCK_END, bodyStart);
    if (end < 0) {
      output += '[未完成的 AgentSignal 已忽略]';
      break;
    }
    const body = remaining.slice(bodyStart, end).trim();
    if (!decodeAgentSignalBlock(body)) output += '[无效的 AgentSignal 已忽略]';
    remaining = remaining.slice(end + AGENT_SIGNAL_BLOCK_END.length);
  }
  return normalizeVisibleText(output);
}

/**
 * Incrementally removes typed AgentSignal blocks from streamed text. It keeps
 * only a short possible start-token suffix, so normal text continues to render
 * without waiting for the completed agent message snapshot.
 */
export class AgentSignalStreamDecoder {
  private buffer = '';

  push(chunk: string): DecodedAgentSignalText {
    this.buffer += chunk;
    let text = '';
    const signals: AgentSignal[] = [];

    while (this.buffer) {
      const start = this.buffer.indexOf(AGENT_SIGNAL_BLOCK_START);
      if (start < 0) {
        const held = longestStartTokenSuffix(this.buffer);
        const emitLength = this.buffer.length - held;
        text += this.buffer.slice(0, emitLength);
        this.buffer = this.buffer.slice(emitLength);
        break;
      }
      if (start > 0) {
        text += this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start);
        continue;
      }

      const bodyStart = AGENT_SIGNAL_BLOCK_START.length;
      const end = this.buffer.indexOf(AGENT_SIGNAL_BLOCK_END, bodyStart);
      if (end < 0) {
        if (this.buffer.length > MAX_SIGNAL_BLOCK_CHARS) {
          text += '[过大的 AgentSignal 已忽略]';
          this.buffer = '';
        }
        break;
      }

      const body = this.buffer.slice(bodyStart, end).trim();
      const signal = decodeAgentSignalBlock(body);
      if (signal) signals.push(signal);
      else text += '[无效的 AgentSignal 已忽略]';
      this.buffer = this.buffer.slice(end + AGENT_SIGNAL_BLOCK_END.length);
    }

    return { text, signals };
  }

  replace(text: string): DecodedAgentSignalText {
    this.buffer = '';
    return {
      text: stripAgentSignalBlocks(text),
      signals: extractAgentSignals(text),
    };
  }

  finish(): DecodedAgentSignalText {
    if (!this.buffer) return { text: '', signals: [] };
    const pending = this.buffer;
    this.buffer = '';
    if (pending.includes(AGENT_SIGNAL_BLOCK_START)) {
      return { text: '[未完成的 AgentSignal 已忽略]', signals: [] };
    }
    return { text: pending, signals: [] };
  }
}

function normalizeProactiveAgentSignal(raw: unknown): AgentSignal | undefined {
  const obj = asRecord(raw);
  if (!obj || FORBIDDEN_ROUTING_FIELDS.some((field) => field in obj)) return undefined;
  const id = boundedString(obj.id, MAX_ID_CHARS);
  const kind = signalKind(obj.kind);
  const title = boundedString(obj.title, MAX_TITLE_CHARS);
  const summary = boundedString(obj.summary, MAX_SUMMARY_CHARS);
  const severity = signalSeverity(obj.severity);
  if (!id || !kind || !title || !summary) return undefined;

  const base = {
    id,
    kind,
    title,
    summary,
    ...(severity ? { severity } : {}),
  };

  switch (kind) {
    case 'progress':
      return {
        ...base,
        kind,
        ...optionalString('phase', obj.phase),
        ...optionalString('cwd', obj.cwd),
        ...(finiteNumber(obj.pid) !== undefined ? { pid: finiteNumber(obj.pid) } : {}),
      };
    case 'risk_approval':
      return {
        ...base,
        kind,
        ...optionalString('risk', obj.risk),
        ...optionalString('proposedAction', obj.proposedAction),
        ...optionalActions(obj.actions),
      };
    case 'choice':
      return { ...base, kind, ...optionalActions(obj.actions) };
    case 'status':
      return { ...base, kind, ...optionalString('state', obj.state) };
    case 'final_result':
      return {
        ...base,
        kind,
        ...optionalString('lifecycle', obj.lifecycle),
        ...optionalString('cwd', obj.cwd),
      };
    case 'artifact_preview': {
      const artifact = asRecord(obj.artifact);
      const path = boundedString(artifact?.path, MAX_DETAIL_CHARS);
      if (!artifact || !path) return undefined;
      return {
        ...base,
        kind,
        artifact: {
          path,
          ...optionalString('mimeType', artifact.mimeType),
          ...optionalString('representationHint', artifact.representationHint),
          ...optionalString('sourceToolId', artifact.sourceToolId),
        },
      };
    }
    case 'patch_preview': {
      const patch = asRecord(obj.patch);
      const fileCount = finiteNumber(patch?.fileCount);
      if (!patch || fileCount === undefined || fileCount < 0) return undefined;
      return {
        ...base,
        kind,
        patch: {
          fileCount,
          ...optionalString('command', patch.command),
          ...optionalString('outputPreview', patch.outputPreview),
          ...optionalString('sourceToolId', patch.sourceToolId),
        },
      };
    }
    case 'test_report': {
      const test = asRecord(obj.test);
      const command = boundedString(test?.command, MAX_DETAIL_CHARS);
      if (!test || !command || typeof test.passed !== 'boolean') return undefined;
      return {
        ...base,
        kind,
        test: {
          command,
          passed: test.passed,
          ...optionalString('outputPreview', test.outputPreview),
          ...optionalString('sourceToolId', test.sourceToolId),
        },
      };
    }
  }
}

function* signalBlockBodies(text: string): Generator<string> {
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(AGENT_SIGNAL_BLOCK_START, cursor);
    if (start < 0) return;
    const bodyStart = start + AGENT_SIGNAL_BLOCK_START.length;
    const end = text.indexOf(AGENT_SIGNAL_BLOCK_END, bodyStart);
    if (end < 0) return;
    yield text.slice(bodyStart, end).trim();
    cursor = end + AGENT_SIGNAL_BLOCK_END.length;
  }
}

function longestStartTokenSuffix(value: string): number {
  const max = Math.min(value.length, AGENT_SIGNAL_BLOCK_START.length - 1);
  for (let length = max; length > 0; length--) {
    if (AGENT_SIGNAL_BLOCK_START.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function boundedString(value: unknown, max = MAX_DETAIL_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function optionalString<Key extends string>(key: Key, value: unknown): { [K in Key]?: string } {
  const normalized = boundedString(value);
  return normalized ? { [key]: normalized } as { [K in Key]?: string } : {};
}

function optionalActions(value: unknown): { actions?: string[] } {
  if (!Array.isArray(value)) return {};
  const actions = value
    .map((item) => boundedString(item, 120))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
  return actions.length > 0 ? { actions } : {};
}

function signalKind(value: unknown): AgentSignalKind | undefined {
  return typeof value === 'string' && SIGNAL_KINDS.has(value as AgentSignalKind)
    ? value as AgentSignalKind
    : undefined;
}

function signalSeverity(value: unknown): SignalSeverity | undefined {
  return typeof value === 'string' && SEVERITIES.has(value as SignalSeverity)
    ? value as SignalSeverity
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
