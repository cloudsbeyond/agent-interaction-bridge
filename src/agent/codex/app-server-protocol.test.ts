import { describe, expect, test } from 'vitest';
import {
  buildTurnStartParams,
  translateAppServerNotification,
} from './app-server-protocol';

describe('codex app-server protocol helpers', () => {
  test('builds a text turn/start request for an existing thread', () => {
    expect(
      buildTurnStartParams({
        threadId: 'thread-1',
        cwd: '/tmp/project',
        prompt: 'reply only: pong',
        approvalPolicy: 'on-request',
        sandboxMode: 'workspace-write',
      }),
    ).toEqual({
      threadId: 'thread-1',
      cwd: '/tmp/project',
      approvalPolicy: 'on-request',
      sandboxPolicy: {
        type: 'workspaceWrite',
        networkAccess: false,
        writableRoots: ['/tmp/project'],
      },
      input: [{ type: 'text', text: 'reply only: pong', text_elements: [] }],
    });
  });

  test('translates app-server message deltas and completion to agent events', () => {
    expect([
      ...translateAppServerNotification({
        method: 'item/agentMessage/delta',
        params: {
          delta: 'pong',
        },
      }),
      ...translateAppServerNotification({
        method: 'turn/completed',
        params: {
          threadId: 'thread-1',
          turn: { id: 'turn-1', status: 'completed' },
        },
      }),
    ]).toEqual([{ type: 'text', delta: 'pong' }, { type: 'done', sessionId: 'thread-1' }]);
  });

  test('translates token usage notifications', () => {
    expect([
      ...translateAppServerNotification({
        method: 'thread/tokenUsage/updated',
        params: {
          tokenUsage: {
            total: {
              inputTokens: 12,
              outputTokens: 3,
            },
          },
        },
      }),
    ]).toEqual([{ type: 'usage', inputTokens: 12, outputTokens: 3 }]);
  });

  test('emits completed agent messages as final text snapshots', () => {
    expect([
      ...translateAppServerNotification({
        method: 'item/agentMessage/delta',
        params: {
          delta: 'po',
        },
      }),
      ...translateAppServerNotification({
        method: 'item/completed',
        params: {
          item: {
            type: 'agentMessage',
            text: 'pong',
          },
        },
      }),
    ]).toEqual([{ type: 'text', delta: 'po' }, { type: 'text_replace', text: 'pong' }]);
  });
});
