import { describe, expect, test } from 'vitest';
import { buildSessionScope } from './scope';

describe('session scope', () => {
  test('keeps p2p and regular group sessions scoped to the chat', () => {
    expect(buildSessionScope('chat-1', undefined, 'p2p')).toBe('chat-1');
    expect(buildSessionScope('chat-1', 'thread-1', 'group')).toBe('chat-1');
  });

  test('scopes topic groups to one independent topic thread', () => {
    expect(buildSessionScope('chat-1', 'thread-1', 'topic')).toBe('chat-1:thread-1');
  });

  test('falls back to the chat scope when a topic click has no thread id', () => {
    expect(buildSessionScope('chat-1', undefined, 'topic')).toBe('chat-1');
  });
});
