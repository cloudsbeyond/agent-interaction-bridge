import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { GatewayMode } from '../config/schema';
import { isGatewayMode } from '../config/schema';
import { paths } from '../config/paths';
import { log } from '../core/logger';

export interface SessionEntry {
  /** May be absent if the entry was created by /timeout before any run
   * recorded a session id. Treat absence as "no resumable session". */
  sessionId?: string;
  /** Pinned cwd for the resumable session. Absent for the same reason. */
  cwd?: string;
  /** Agent runtime that created this session. Runtime boundaries should not
   * accidentally inherit each other's long-lived context. */
  agentRuntimeId?: string;
  updatedAt: number;
  /** Per-scope idle-timeout override (minutes). 0 = explicitly off for this
   * scope, undefined = follow global default. /new clears the whole entry,
   * so this resets to "follow global" when the user starts a new session. */
  idleTimeoutMinutes?: number;
  /** Per-scope gateway mode override. Undefined = follow global default. */
  gatewayMode?: GatewayMode;
  /** Prompt/presentation context version used when the agent session was created. */
  contextVersion?: string;
  /** Last persisted turn trace artifact id for this scope. */
  turnTraceArtifactId?: string;
}

type SessionMap = Record<string, SessionEntry>;

export class SessionStore {
  private data: SessionMap = {};
  private saving: Promise<void> = Promise.resolve();
  private readonly path: string;

  constructor(path: string = paths.sessionsFile) {
    this.path = path;
  }

  async load(): Promise<void> {
    try {
      const text = await readFile(this.path, 'utf8');
      const raw = JSON.parse(text) as Record<string, Partial<SessionEntry>>;
      this.data = {};
      for (const [chatId, entry] of Object.entries(raw)) {
        if (!entry || typeof entry.updatedAt !== 'number') continue;
        // Drop entries without a `cwd`/`sessionId` pair *unless* there's
        // some other persisted state worth keeping (e.g. an idle-timeout
        // override). Resuming a session whose cwd we don't know about
        // would hang Codex on a missing jsonl, so resume keys still need
        // the full pair; but a bare timeout override is fine on its own.
        const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : undefined;
        const cwd = typeof entry.cwd === 'string' ? entry.cwd : undefined;
        const agentRuntimeId =
          typeof entry.agentRuntimeId === 'string' ? entry.agentRuntimeId : undefined;
        const idleTimeoutMinutes =
          typeof entry.idleTimeoutMinutes === 'number' ? entry.idleTimeoutMinutes : undefined;
        const gatewayMode = isGatewayMode(entry.gatewayMode) ? entry.gatewayMode : undefined;
        const contextVersion =
          typeof entry.contextVersion === 'string' ? entry.contextVersion : undefined;
        const turnTraceArtifactId =
          typeof entry.turnTraceArtifactId === 'string' ? entry.turnTraceArtifactId : undefined;
        const hasSession = sessionId !== undefined && cwd !== undefined;
        if (
          !hasSession &&
          idleTimeoutMinutes === undefined &&
          gatewayMode === undefined &&
          turnTraceArtifactId === undefined
        ) continue;
        this.data[chatId] = {
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(cwd !== undefined ? { cwd } : {}),
          ...(agentRuntimeId !== undefined ? { agentRuntimeId } : {}),
          updatedAt: entry.updatedAt,
          ...(idleTimeoutMinutes !== undefined ? { idleTimeoutMinutes } : {}),
          ...(gatewayMode !== undefined ? { gatewayMode } : {}),
          ...(contextVersion !== undefined ? { contextVersion } : {}),
          ...(turnTraceArtifactId !== undefined ? { turnTraceArtifactId } : {}),
        };
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /**
   * Return the session id for this chat if it was created in the given cwd.
   * Sessions recorded in a different cwd are stale — Codex can't resume
   * them from a different working directory.
   */
  resumeFor(
    chatId: string,
    cwd: string,
    agentRuntimeId?: string,
    contextVersion?: string,
  ): string | undefined {
    const entry = this.data[chatId];
    if (!entry) return undefined;
    if (entry.cwd !== cwd) return undefined;
    if (agentRuntimeId !== undefined && entry.agentRuntimeId !== agentRuntimeId) {
      return undefined;
    }
    if (contextVersion !== undefined && entry.contextVersion !== contextVersion) {
      return undefined;
    }
    return entry.sessionId;
  }

  getRaw(chatId: string): SessionEntry | undefined {
    return this.data[chatId];
  }

  set(
    chatId: string,
    sessionId: string,
    cwd: string,
    agentRuntimeId?: string,
    contextVersion?: string,
  ): void {
    // Preserve per-scope preferences across run starts. /new (clear) wipes them.
    const prev = this.data[chatId];
    this.data[chatId] = {
      sessionId,
      cwd,
      ...(agentRuntimeId !== undefined ? { agentRuntimeId } : {}),
      ...(contextVersion !== undefined ? { contextVersion } : {}),
      updatedAt: Date.now(),
      ...(prev?.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: prev.idleTimeoutMinutes }
        : {}),
      ...(prev?.gatewayMode !== undefined ? { gatewayMode: prev.gatewayMode } : {}),
      ...(prev?.turnTraceArtifactId !== undefined ? { turnTraceArtifactId: prev.turnTraceArtifactId } : {}),
    };
    this.schedulePersist();
  }

  clear(chatId: string): void {
    if (!(chatId in this.data)) return;
    delete this.data[chatId];
    this.schedulePersist();
  }

  clearResumableSession(chatId: string): boolean {
    const prev = this.data[chatId];
    if (!prev) return false;
    const { sessionId: _, cwd: __, agentRuntimeId: ___, contextVersion: ____, ...rest } = prev;
    if (
      prev.sessionId === undefined &&
      prev.cwd === undefined &&
      prev.agentRuntimeId === undefined &&
      prev.contextVersion === undefined
    ) {
      return false;
    }
    this.data[chatId] = { ...rest, updatedAt: Date.now() };
    this.schedulePersist();
    return true;
  }

  getTurnTraceArtifactId(chatId: string): string | undefined {
    return this.data[chatId]?.turnTraceArtifactId;
  }

  setTurnTraceArtifactId(chatId: string, artifactId: string): void {
    const prev = this.data[chatId];
    this.data[chatId] = {
      ...(prev ?? { updatedAt: Date.now() }),
      turnTraceArtifactId: artifactId,
      updatedAt: Date.now(),
    };
    this.schedulePersist();
  }

  /** Per-scope idle-timeout override. `undefined` means no override set. */
  getIdleTimeoutMinutes(chatId: string): number | undefined {
    return this.data[chatId]?.idleTimeoutMinutes;
  }

  setIdleTimeoutMinutes(chatId: string, minutes: number): void {
    const clamped = Math.min(Math.max(Math.floor(minutes), 0), 120);
    const prev = this.data[chatId];
    this.data[chatId] = {
      ...(prev ?? { updatedAt: Date.now() }),
      idleTimeoutMinutes: clamped,
      updatedAt: Date.now(),
    };
    this.schedulePersist();
  }

  /** Remove the override so this scope falls back to the global default.
   * Returns true if something was actually removed. */
  clearIdleTimeoutOverride(chatId: string): boolean {
    const prev = this.data[chatId];
    if (!prev || prev.idleTimeoutMinutes === undefined) return false;
    const { idleTimeoutMinutes: _, ...rest } = prev;
    this.data[chatId] = { ...rest, updatedAt: Date.now() };
    this.schedulePersist();
    return true;
  }

  /** Per-scope gateway mode override. `undefined` means no override set. */
  getGatewayMode(chatId: string): GatewayMode | undefined {
    return this.data[chatId]?.gatewayMode;
  }

  setGatewayMode(chatId: string, mode: GatewayMode): void {
    const prev = this.data[chatId];
    this.data[chatId] = {
      ...(prev ?? { updatedAt: Date.now() }),
      gatewayMode: mode,
      updatedAt: Date.now(),
    };
    this.schedulePersist();
  }

  /** Remove the override so this scope falls back to the global default. */
  clearGatewayModeOverride(chatId: string): boolean {
    const prev = this.data[chatId];
    if (!prev || prev.gatewayMode === undefined) return false;
    const { gatewayMode: _, ...rest } = prev;
    this.data[chatId] = { ...rest, updatedAt: Date.now() };
    this.schedulePersist();
    return true;
  }

  async flush(): Promise<void> {
    await this.saving;
  }

  private schedulePersist(): void {
    this.saving = this.saving
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.tmp-${process.pid}`;
        await writeFile(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
        await chmod(tmp, 0o600);
        await rename(tmp, this.path);
      })
      .catch((err: unknown) => {
        log.fail('session', err, { step: 'persist' });
      });
  }
}
