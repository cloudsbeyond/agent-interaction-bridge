import { describe, expect, test } from 'vitest';
import { renderText } from './text-renderer';
import type { RunState } from './run-state';

describe('renderText', () => {
  test('normalizes chat-facing markdown that Feishu renders poorly', () => {
    const state: RunState = {
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: '#Agent-Interaction-Bridge\n```text\nSignal -> Presentation -> Carrier\n```\n##三件事',
        },
      ],
      reasoning: { content: '', active: false },
      footer: null,
      terminal: 'done',
    };

    expect(renderText(state)).toBe(
      '# Agent-Interaction-Bridge\nSignal -> Presentation -> Carrier\n## 三件事',
    );
  });

  test('does not render structured interaction protocol JSON as chat text', () => {
    const state: RunState = {
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: [
            '```json',
            '{"agent_interaction":{"id":"bot-profile","kind":"risk_approval","title":"Review bot profile update","summary":"This would update bot configuration.","risk":"external_side_effect","proposedAction":"Update bot description to: Example assistant profile","options":["approve","modify","reject","patch_only"]}}',
            '```',
          ].join('\n'),
        },
      ],
      reasoning: { content: '', active: false },
      footer: null,
      terminal: 'done',
    };

    expect(renderText(state)).toBe('');
  });
});
