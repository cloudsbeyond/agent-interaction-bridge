import { describe, expect, test } from 'vitest';
import { SignalTimelineStore } from './timeline';

describe('SignalTimelineStore', () => {
  test('appends scoped signal records in order', () => {
    const store = new SignalTimelineStore(() => 1000);

    const first = store.append('chat-a', {
      kind: 'progress',
      title: 'Started',
      summary: 'Codex started.',
    });
    const second = store.append('chat-a', {
      kind: 'final_result',
      title: 'Done',
      summary: 'Codex finished.',
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(store.list('chat-a').map((record) => record.signal.title)).toEqual(['Started', 'Done']);
  });

  test('tracks unresolved human-facing decisions', () => {
    const store = new SignalTimelineStore(() => 2000);
    store.append('chat-a', {
      id: 'risk-delete',
      kind: 'risk_approval',
      title: 'Delete files?',
      summary: 'Codex wants to delete generated files.',
    });

    expect(store.pendingDecisions('chat-a').map((record) => record.signal.id)).toEqual([
      'risk-delete',
    ]);

    const resolved = store.resolve('chat-a', 'risk-delete', {
      action: 'reject',
      actorId: 'ou_test',
    });

    expect(resolved).toBe(true);
    expect(store.pendingDecisions('chat-a')).toEqual([]);
    expect(store.list('chat-a')[0]?.decision?.action).toBe('reject');
  });
});
