import { describe, expect, test } from 'vitest';
import { translateEvent } from './stream-json';

function events(raw: unknown) {
  return [...translateEvent(raw)];
}

describe('translateEvent', () => {
  const threadId = ['019e488d', '4cb9', '7f21', 'abe7', '7b3320ee280a'].join('-');

  test('emits a system event with agent runtime thread id', () => {
    expect(
      events({
        type: 'thread.started',
        thread_id: threadId,
      }),
    ).toEqual([
      {
        type: 'system',
        sessionId: threadId,
      },
    ]);
  });

  test('emits assistant message text', () => {
    expect(
      events({
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'agent_message',
          text: 'pong',
        },
      }),
    ).toEqual([{ type: 'text', delta: 'pong' }]);
  });

  test('emits command execution start as tool use', () => {
    expect(
      events({
        type: 'item.started',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '/bin/zsh -lc pwd',
          status: 'in_progress',
        },
      }),
    ).toEqual([
      {
        type: 'tool_use',
        id: 'item_1',
        name: 'shell',
        input: { command: '/bin/zsh -lc pwd' },
      },
    ]);
  });

  test('emits successful command execution output as tool result', () => {
    expect(
      events({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '/bin/zsh -lc pwd',
          aggregated_output: '/tmp/project\n',
          exit_code: 0,
          status: 'completed',
        },
      }),
    ).toEqual([
      {
        type: 'tool_result',
        id: 'item_1',
        output: '/tmp/project\n',
        isError: false,
      },
    ]);
  });

  test('marks failed command execution output as error', () => {
    expect(
      events({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '/bin/zsh -lc false',
          aggregated_output: '',
          exit_code: 1,
          status: 'failed',
        },
      }),
    ).toEqual([
      {
        type: 'tool_result',
        id: 'item_1',
        output: '',
        isError: true,
      },
    ]);
  });

  test('emits usage and done on turn completion', () => {
    expect(
      events({
        type: 'turn.completed',
        usage: {
          input_tokens: 123,
          output_tokens: 45,
        },
      }),
    ).toEqual([
      {
        type: 'usage',
        inputTokens: 123,
        outputTokens: 45,
      },
      { type: 'done' },
    ]);
  });
});
