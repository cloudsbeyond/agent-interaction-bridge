import type { RunState } from '../card/run-state';

export type TaskLifecycle =
  | 'pending_approval'
  | 'running'
  | 'done'
  | 'error'
  | 'interrupted'
  | 'idle_timeout'
  | 'cancelled';

export interface TaskSnapshot {
  state: TaskLifecycle;
  task: string;
  cwd: string;
  pid?: number;
  startedAt?: number;
  updatedAt: number;
  finishedAt?: number;
  elapsedMs: number;
  recentOutput: string;
}

interface MutableTask {
  state: TaskLifecycle;
  task: string;
  cwd: string;
  pid?: number;
  startedAt?: number;
  updatedAt: number;
  finishedAt?: number;
  recentOutput: string;
}

export class TaskStatusStore {
  private readonly byScope = new Map<string, MutableTask>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  markPending(scope: string, input: { task: string; cwd: string }): void {
    const now = this.now();
    this.byScope.set(scope, {
      state: 'pending_approval',
      task: input.task,
      cwd: input.cwd,
      updatedAt: now,
      recentOutput: '等待按钮审批',
    });
  }

  markRunning(scope: string, input: { task: string; cwd: string; pid?: number }): void {
    const now = this.now();
    this.byScope.set(scope, {
      state: 'running',
      task: input.task,
      cwd: input.cwd,
      pid: input.pid,
      startedAt: now,
      updatedAt: now,
      recentOutput: 'Agent runtime 已启动',
    });
  }

  updateFromRunState(scope: string, state: RunState): void {
    const current = this.byScope.get(scope);
    if (!current) return;
    current.updatedAt = this.now();
    const text = state.blocks
      .map((b) => (b.kind === 'text' ? b.content : `${b.tool.name}: ${b.tool.status}`))
      .join('\n')
      .trim();
    if (text) current.recentOutput = truncateTail(text, 1200);
  }

  finish(scope: string, state: Exclude<TaskLifecycle, 'pending_approval' | 'running'>): void {
    const current = this.byScope.get(scope);
    if (!current) return;
    current.state = state;
    current.updatedAt = this.now();
    current.finishedAt = current.updatedAt;
  }

  snapshot(scope: string): TaskSnapshot | undefined {
    const current = this.byScope.get(scope);
    if (!current) return undefined;
    const end = current.finishedAt ?? this.now();
    return { ...current, elapsedMs: current.startedAt ? end - current.startedAt : 0 };
  }
}

function truncateTail(s: string, max: number): string {
  return s.length > max ? `…${s.slice(-max)}` : s;
}
