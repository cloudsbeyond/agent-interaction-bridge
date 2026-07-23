import { describe, expect, test } from 'vitest';
import { classifyInteractionIntent } from './intent';
import {
  planInteractionPresentation,
  renderInteractionPresentationPlanBlock,
} from './presentation-plan';

describe('interaction presentation planning', () => {
  test('plans Dynamic UI for architecture tasks outside InteractionIntent', () => {
    const text = '画一下当前 bridge 架构';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: false,
      channel: 'feishu',
    });

    const plan = planInteractionPresentation({ text, intent });

    expect(intent).not.toHaveProperty('presentation');
    expect(plan).toEqual({
      expressionProfile: { kind: 'architecture_explanation' },
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
      layout: 'architecture',
      density: 'compact',
      suggestedSections: ['主链路', '组件', '执行端', '边界', '下一步'],
    });
    expect(renderInteractionPresentationPlanBlock(plan)).toContain(
      '<presentation_plan>',
    );
  });

  test('keeps metric snapshots in text presentation', () => {
    const text = '看看指标 A 和指标 B 的行情';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(planInteractionPresentation({ text, intent })).toEqual({
      expressionProfile: { kind: 'metric_snapshot' },
      representation: 'text',
      source: 'rule_based',
      density: 'compact',
      suggestedSections: ['快照', '解读', '来源'],
      requirements: [
        'Use complete metric bullets.',
        'State plainly when source-backed data is unavailable.',
      ],
    });
  });

  test('plans an interactive card for explicit card feedback', () => {
    const text = '信息密度很高，且是有层次的，应该用飞书卡片嘛';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(planInteractionPresentation({ text, intent })).toMatchObject({
      expressionProfile: { kind: 'compact_chat_answer' },
      representation: 'interactive_card',
      source: 'explicit_user_feedback',
      density: 'compact',
    });
  });

  test('does not create a presentation plan for ordinary tasks', () => {
    const text = '帮我检查 git 状态并总结';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(planInteractionPresentation({ text, intent })).toBeUndefined();
  });
});
