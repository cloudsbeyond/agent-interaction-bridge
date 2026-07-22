import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { paths } from '../config/paths';
import type { AgentSignalKind } from './router';

const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_RECORDS = 10_000;

export type ProactiveCorrelationStatus =
  | 'pending'
  | 'policy_rejected'
  | 'delivered'
  | 'delivery_failed'
  | 'delivery_unknown'
  | 'audit_failed'
  | 'reply_resolved';

export interface ProactiveCorrelationRecord {
  schemaVersion: 1;
  correlationId: string;
  idempotencyKey: string;
  signalId: string;
  signalKind: AgentSignalKind;
  chatId: string;
  scope: string;
  sessionId: string;
  agentRuntimeId: string;
  endpointProfileId: string;
  cwd: string;
  contextVersion: string;
  originMessageId?: string;
  carrierMessageId?: string;
  replyMessageId?: string;
  status: ProactiveCorrelationStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  failureReason?: string;
}

export interface ReserveProactiveCorrelationInput {
  signalId: string;
  signalKind: AgentSignalKind;
  chatId: string;
  scope: string;
  sessionId: string;
  agentRuntimeId: string;
  endpointProfileId: string;
  cwd: string;
  contextVersion: string;
  originMessageId?: string;
}

export interface ProactiveCorrelationStoreOptions {
  path?: string;
  now?: () => Date;
  createId?: () => string;
  ttlMs?: number;
  maxRecords?: number;
}

export class ProactiveCorrelationStore {
  private records: ProactiveCorrelationRecord[] = [];
  private saving: Promise<void> = Promise.resolve();
  private readonly path: string;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly ttlMs: number;
  private readonly maxRecords: number;

  constructor(options: ProactiveCorrelationStoreOptions = {}) {
    this.path = options.path ?? paths.proactiveCorrelationsFile;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  async load(): Promise<void> {
    try {
      const text = await readFile(this.path, 'utf8');
      const raw = JSON.parse(text) as unknown;
      this.records = Array.isArray(raw)
        ? raw.map(normalizeRecord).filter((item): item is ProactiveCorrelationRecord => Boolean(item))
        : [];
      if (this.prune()) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }

  async reserve(input: ReserveProactiveCorrelationInput): Promise<{
    record: ProactiveCorrelationRecord;
    duplicate: boolean;
  }> {
    this.prune();
    const idempotencyKey = proactiveIdempotencyKey(input);
    const existing = this.records.find((record) => record.idempotencyKey === idempotencyKey);
    if (existing) return { record: cloneRecord(existing), duplicate: true };

    const now = this.now();
    const timestamp = now.toISOString();
    const record: ProactiveCorrelationRecord = {
      schemaVersion: SCHEMA_VERSION,
      correlationId: this.createId(),
      idempotencyKey,
      signalId: input.signalId,
      signalKind: input.signalKind,
      chatId: input.chatId,
      scope: input.scope,
      sessionId: input.sessionId,
      agentRuntimeId: input.agentRuntimeId,
      endpointProfileId: input.endpointProfileId,
      cwd: input.cwd,
      contextVersion: input.contextVersion,
      ...(input.originMessageId ? { originMessageId: input.originMessageId } : {}),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    this.records.push(record);
    this.prune();
    try {
      await this.persist();
    } catch (error) {
      this.records = this.records.filter((item) => item.correlationId !== record.correlationId);
      throw error;
    }
    return { record: cloneRecord(record), duplicate: false };
  }

  async markDelivered(correlationId: string, carrierMessageId: string): Promise<ProactiveCorrelationRecord> {
    return this.update(correlationId, {
      status: 'delivered',
      carrierMessageId,
      failureReason: undefined,
    });
  }

  async markFailed(
    correlationId: string,
    status: Extract<ProactiveCorrelationStatus, 'policy_rejected' | 'delivery_failed' | 'delivery_unknown' | 'audit_failed'>,
    failureReason: string,
  ): Promise<ProactiveCorrelationRecord> {
    return this.update(correlationId, { status, failureReason: failureReason.slice(0, 1_000) });
  }

  async markReplyResolved(correlationId: string, replyMessageId: string): Promise<ProactiveCorrelationRecord> {
    return this.update(correlationId, { status: 'reply_resolved', replyMessageId });
  }

  resolveReply(input: {
    chatId: string;
    candidateMessageIds: string[];
    endpointProfileId: string;
  }): ProactiveCorrelationRecord | undefined {
    const record = this.findReplyCandidate(input);
    if (record?.endpointProfileId !== input.endpointProfileId) return undefined;
    return record;
  }

  findReplyCandidate(input: {
    chatId: string;
    candidateMessageIds: string[];
  }): ProactiveCorrelationRecord | undefined {
    this.prune();
    const candidates = new Set(input.candidateMessageIds.filter(Boolean));
    const record = this.records.find((item) =>
      item.chatId === input.chatId
      && item.status === 'delivered'
      && Boolean(item.carrierMessageId && candidates.has(item.carrierMessageId)),
    );
    return record ? cloneRecord(record) : undefined;
  }

  get(correlationId: string): ProactiveCorrelationRecord | undefined {
    const record = this.records.find((item) => item.correlationId === correlationId);
    return record ? cloneRecord(record) : undefined;
  }

  async flush(): Promise<void> {
    await this.saving;
  }

  private async update(
    correlationId: string,
    patch: Partial<Pick<
      ProactiveCorrelationRecord,
      'status' | 'carrierMessageId' | 'replyMessageId' | 'failureReason'
    >>,
  ): Promise<ProactiveCorrelationRecord> {
    const record = this.records.find((item) => item.correlationId === correlationId);
    if (!record) throw new Error(`Unknown proactive correlation: ${correlationId}`);
    const before = cloneRecord(record);
    Object.assign(record, patch, { updatedAt: this.now().toISOString() });
    if (patch.failureReason === undefined) delete record.failureReason;
    try {
      await this.persist();
    } catch (error) {
      for (const key of Object.keys(record) as Array<keyof ProactiveCorrelationRecord>) {
        delete record[key];
      }
      Object.assign(record, before);
      throw error;
    }
    return cloneRecord(record);
  }

  private prune(): boolean {
    const before = this.records.length;
    const now = this.now().getTime();
    this.records = this.records
      .filter((record) => Date.parse(record.expiresAt) > now)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(this.records.length - this.maxRecords);
    }
    return this.records.length !== before;
  }

  private persist(): Promise<void> {
    this.saving = this.saving.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp-${process.pid}-${this.createId()}`;
      await writeFile(tmp, `${JSON.stringify(this.records, null, 2)}\n`, 'utf8');
      await chmod(tmp, 0o600);
      await rename(tmp, this.path);
    });
    return this.saving;
  }
}

export function proactiveIdempotencyKey(input: Pick<
  ReserveProactiveCorrelationInput,
  'scope' | 'sessionId' | 'signalId'
>): string {
  return `${input.scope}\u0000${input.sessionId}\u0000${input.signalId}`;
}

function normalizeRecord(value: unknown): ProactiveCorrelationRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (
    item.schemaVersion !== SCHEMA_VERSION
    || !requiredStrings(item, [
      'correlationId',
      'idempotencyKey',
      'signalId',
      'signalKind',
      'chatId',
      'scope',
      'sessionId',
      'agentRuntimeId',
      'endpointProfileId',
      'cwd',
      'contextVersion',
      'status',
      'createdAt',
      'updatedAt',
      'expiresAt',
    ])
  ) return undefined;
  return value as ProactiveCorrelationRecord;
}

function requiredStrings(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof value[field] === 'string' && value[field] !== '');
}

function cloneRecord(record: ProactiveCorrelationRecord): ProactiveCorrelationRecord {
  return { ...record };
}
