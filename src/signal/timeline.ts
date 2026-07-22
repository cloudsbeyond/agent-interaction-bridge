import type { AgentSignal } from './router';

export interface SignalDecision {
  action: string;
  actorId?: string;
  comment?: string;
  decidedAt?: number;
}

export interface SignalRecord {
  seq: number;
  scope: string;
  createdAt: number;
  signal: AgentSignal;
  decision?: SignalDecision;
}

export class SignalTimelineStore {
  private nextSeq = 1;
  private readonly byScope = new Map<string, SignalRecord[]>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  append(scope: string, signal: AgentSignal): SignalRecord {
    const record: SignalRecord = {
      seq: this.nextSeq,
      scope,
      createdAt: this.now(),
      signal,
    };
    this.nextSeq += 1;
    const records = this.byScope.get(scope) ?? [];
    records.push(record);
    this.byScope.set(scope, records);
    return cloneRecord(record);
  }

  list(scope: string, limit?: number): SignalRecord[] {
    const records = this.byScope.get(scope) ?? [];
    const selected = limit && limit > 0 ? records.slice(-limit) : records;
    return selected.map(cloneRecord);
  }

  pendingDecisions(scope: string): SignalRecord[] {
    return this.list(scope).filter(
      (record) =>
        !record.decision &&
        (record.signal.kind === 'risk_approval' || record.signal.kind === 'choice'),
    );
  }

  resolve(scope: string, signalId: string, decision: SignalDecision): boolean {
    const records = this.byScope.get(scope) ?? [];
    const record = records.find((candidate) => candidate.signal.id === signalId);
    if (!record || record.decision) return false;
    record.decision = {
      ...decision,
      decidedAt: decision.decidedAt ?? this.now(),
    };
    return true;
  }

  clear(scope: string): boolean {
    return this.byScope.delete(scope);
  }
}

function cloneRecord(record: SignalRecord): SignalRecord {
  return {
    ...record,
    signal: cloneSignal(record.signal),
    decision: record.decision ? { ...record.decision } : undefined,
  };
}

function cloneSignal(signal: AgentSignal): AgentSignal {
  switch (signal.kind) {
    case 'risk_approval':
    case 'choice':
      return { ...signal, actions: signal.actions ? [...signal.actions] : undefined };
    case 'artifact_preview':
      return { ...signal, artifact: { ...signal.artifact } };
    case 'patch_preview':
      return { ...signal, patch: { ...signal.patch } };
    case 'test_report':
      return { ...signal, test: { ...signal.test } };
    case 'progress':
    case 'status':
    case 'final_result':
      return { ...signal };
  }
}
