import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentEndpointKind } from '../config/schema';

export const RUNTIME_HEALTH_STALE_MS = 60_000;

export type RuntimeHealthState =
  | 'starting'
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'stopped';

export interface RuntimeHealthSnapshot {
  schemaVersion: 1;
  processId: string;
  pid: number;
  endpoint: AgentEndpointKind;
  endpointAvailable: boolean;
  state: RuntimeHealthState;
  updatedAt: string;
  lastConnectedAt?: string;
  issue?: string;
  reconnectAttempts?: number;
}

export interface RuntimeHealthView extends RuntimeHealthSnapshot {
  fresh: boolean;
}

export type RuntimeHealthUpdate = Partial<
  Pick<
    RuntimeHealthSnapshot,
    'endpoint' | 'endpointAvailable' | 'state' | 'issue' | 'reconnectAttempts'
  >
>;

interface RuntimeHealthReporterOptions {
  appDir: string;
  processId: string;
  pid: number;
  endpoint: AgentEndpointKind;
  now?: () => number;
}

export function runtimeHealthFile(appDir: string, processId: string): string {
  return join(appDir, 'health', `${processId}.json`);
}

export class RuntimeHealthReporter {
  private readonly file: string;
  private readonly now: () => number;
  private snapshot: RuntimeHealthSnapshot;
  private pending: Promise<void> = Promise.resolve();

  constructor(options: RuntimeHealthReporterOptions) {
    this.file = runtimeHealthFile(options.appDir, options.processId);
    this.now = options.now ?? Date.now;
    this.snapshot = {
      schemaVersion: 1,
      processId: options.processId,
      pid: options.pid,
      endpoint: options.endpoint,
      endpointAvailable: false,
      state: 'starting',
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  update(patch: RuntimeHealthUpdate): Promise<RuntimeHealthSnapshot> {
    const updatedAt = new Date(this.now()).toISOString();
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      updatedAt,
      ...(patch.state === 'connected' ? { lastConnectedAt: updatedAt } : {}),
    };
    if (patch.issue === undefined) delete this.snapshot.issue;
    if (patch.reconnectAttempts === undefined) delete this.snapshot.reconnectAttempts;
    const next = { ...this.snapshot };
    this.pending = this.pending.then(() => writeSnapshot(this.file, next));
    return this.pending.then(() => next);
  }

  async remove(): Promise<void> {
    await this.pending.catch(() => undefined);
    await rm(this.file, { force: true });
  }
}

export async function readRuntimeHealth(
  appDir: string,
  processId: string,
  now = Date.now(),
): Promise<RuntimeHealthView | undefined> {
  try {
    const text = await readFile(runtimeHealthFile(appDir, processId), 'utf8');
    const parsed = JSON.parse(text) as unknown;
    if (!isRuntimeHealthSnapshot(parsed) || parsed.processId !== processId) return undefined;
    const updatedAt = Date.parse(parsed.updatedAt);
    return {
      ...parsed,
      fresh: Number.isFinite(updatedAt) && now - updatedAt <= RUNTIME_HEALTH_STALE_MS,
    };
  } catch {
    return undefined;
  }
}

export function removeRuntimeHealthSync(appDir: string, processId: string): void {
  try {
    rmSync(runtimeHealthFile(appDir, processId), { force: true });
  } catch {
    // Process exit cleanup is best-effort.
  }
}

async function writeSnapshot(file: string, snapshot: RuntimeHealthSnapshot): Promise<void> {
  const temp = `${file}.tmp-${process.pid}`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

function isRuntimeHealthSnapshot(value: unknown): value is RuntimeHealthSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1
    && typeof candidate.processId === 'string'
    && typeof candidate.pid === 'number'
    && (candidate.endpoint === 'exec' || candidate.endpoint === 'app-server')
    && typeof candidate.endpointAvailable === 'boolean'
    && ['starting', 'connected', 'reconnecting', 'degraded', 'stopped'].includes(
      String(candidate.state),
    )
    && typeof candidate.updatedAt === 'string';
}
