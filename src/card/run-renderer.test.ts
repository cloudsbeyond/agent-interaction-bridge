import { describe, expect, test } from 'vitest';
import { appendSessionIdentityCard } from './session-identity';
import { renderCard } from './run-renderer';
import type { RunState } from './run-state';

describe('renderCard', () => {
  test('lowers chat markdown to Feishu card hard line breaks', () => {
    const state: RunState = {
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: [
            '**指标快照**',
            '',
            '**Metric A**',
            '- 当前值：42',
            '- 变化：-2.28%',
            '- 参考区间：35 - 45',
            '',
            '**Metric B**',
            '- 当前值：78.33',
            '- 变化：-1.63%',
            '',
            '**来源**',
            '- Example Source  ',
            'https://example.com/source',
          ].join('\n'),
        },
      ],
    };

    const card = renderCard(state) as { body: { elements: Array<{ tag?: string; content?: string }> } };
    const content = card.body.elements.find((element) => element.tag === 'markdown')?.content;

    expect(content).toContain('**Metric A**  \n- 当前值：42');
    expect(content).toContain('- 参考区间：35 - 45  \n');
    expect(content).toContain('**Metric B**  \n- 当前值：78.33');
    expect(content).toContain('https://example.com/source');
  });

  test('does not render structured interaction protocol JSON in the audit card', () => {
    const state: RunState = {
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
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
    };

    const card = renderCard(state) as { body: { elements: Array<{ tag?: string; content?: string }> } };
    const serialized = JSON.stringify(card);

    expect(serialized).not.toContain('agent_interaction');
    expect(serialized).not.toContain('bot-profile');
  });

  test('keeps the Bridge-owned session footer as one standalone card element', () => {
    const state: RunState = {
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: [
            '**检查点**',
            '- footer 位于卡片底部',
            '',
            '> Session：Bridge - old-bridge | Domain - old-domain',
          ].join('\n'),
        },
      ],
    };

    const card = appendSessionIdentityCard(
      renderCard(state),
      {
        bridge: 'bridge-scope-prefix-50d3c05e',
        domain: '019f89b0-domain-session-suffix',
        elapsedMs: 75_000,
      },
    ) as { body: { elements: Array<{ tag?: string; content?: string }> } };
    const serialized = JSON.stringify(card);

    expect(serialized.match(/Session：📥 -/gu)).toHaveLength(1);
    expect(serialized).not.toContain('old-bridge');
    expect(card.body.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - 50d3c05e | 🤖 - 019f89b0 | ⏳ - 1m 15s',
      text_size: 'notation',
    });
  });
});
