import { describe, expect, test } from 'vitest';
import {
  CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS,
  inspectChatPresentation,
  normalizeChatPresentation,
} from './chat-presentation-contract';

describe('chat presentation contract', () => {
  test('normalizes markdown and splits dense prose for chat surfaces', () => {
    const dense =
      'Agent-Interaction-Bridge receives a human message, keeps the carrier details outside semantic state, asks the local endpoint to do the work, and returns a readable result. Presentation may transform wording or layout, but it must not decide authority, run tools, or change the endpoint decision. Carrier code only delivers the chosen representation.';

    const rendered = normalizeChatPresentation(`#Agent-Interaction-Bridge\n\n\`\`\`text\n${dense}\n\`\`\``);

    expect(rendered).toContain('# Agent-Interaction-Bridge');
    expect(rendered).not.toContain('```text');
    const paragraphs = rendered.split(/\n{2,}/).filter((paragraph) => !paragraph.startsWith('#'));
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.every((paragraph) => paragraph.length <= CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS)).toBe(
      true,
    );
    expect(inspectChatPresentation(rendered)).toEqual([]);
  });

  test('detects raw interaction JSON before it reaches visible chat output', () => {
    const issues = inspectChatPresentation(
      '```json\n{"agent_interaction":{"id":"retry","kind":"human_feedback","title":"Retry","summary":"Need target"}}\n```',
    );

    expect(issues.map((issue) => issue.kind)).toContain('raw_interaction_json');
  });

  test('preserves non-text code fences while inspecting surrounding prose', () => {
    const rendered = normalizeChatPresentation(
      ['Intro sentence.', '```ts', 'const value = "#not-a-heading";', '```', '##Next'].join('\n'),
    );

    expect(rendered).toContain('```ts\nconst value = "#not-a-heading";\n```');
    expect(rendered).toContain('## Next');
    expect(inspectChatPresentation(rendered)).toEqual([]);
  });

  test('does not repair bullet markers inside non-text code fences', () => {
    const rendered = normalizeChatPresentation(
      ['```md', '-中文 literal bullet without a space', '```', '-指标 B 偏修复预期'].join('\n'),
    );

    expect(rendered).toContain('```md\n-中文 literal bullet without a space\n```');
    expect(rendered).toContain('\n- 指标 B 偏修复预期');
  });

  test('repairs generic glued bullet boundaries without business labels', () => {
    const rendered = normalizeChatPresentation(
      [
        '快速看法',
        '- 指标 A 今天回落',
        '- 两个标的都接近参考区间下沿- 指标 A 偏成长预期',
        '-指标 B 偏修复预期',
      ].join('\n'),
    );

    expect(rendered).toContain('参考区间下沿\n- 指标 A 偏成长预期');
    expect(rendered).toContain('\n- 指标 B 偏修复预期');
  });

  test('does not apply domain-specific metric snapshot repairs in the renderer', () => {
    const rendered = normalizeChatPresentation(
      [
        '指标快照',
        '**Metric A**-当前值：42-前值：40-区间：35 - 45来源：Example Source，更新：2026-06-16**Metric B**-当前值：73-变化：-2%',
        '区间：70 - 90',
        '快速判断-Metric A 稳定-Metric B 回落',
      ].join('\n'),
    );

    expect(rendered).toContain('Example Source，更新：2026-06-16');
    expect(rendered).toContain('**Metric A**-当前值');
    expect(rendered).toContain('快速判断-Metric A 稳定-Metric B 回落');
  });
});
