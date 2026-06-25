import { describe, expect, test } from 'vitest';
import {
  classifyInteractionIntentWithJudge,
  classifyInteractionIntent,
  renderInteractionIntentBlock,
  requestsCardPresentation,
} from './intent';

describe('interaction intent', () => {
  test('recognizes presentation criticism as a rewrite request', () => {
    const intent = classifyInteractionIntent({
      text: '还是很挫 一坨',
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(intent).toMatchObject({
      kind: 'presentation_feedback',
      target: 'previous_agent_output',
      confidence: 'high',
      requiresPriorContext: true,
    });

    const block = renderInteractionIntentBlock(intent);
    expect(block).toContain('<interaction_intent>');
    expect(block).toContain('presentation_feedback');
    expect(block).toContain('rewrite the prior answer');
    expect(block).toContain('Do not emit agent_interaction JSON');
  });

  test('recognizes short retry feedback and asks plainly when context is missing', () => {
    const intent = classifyInteractionIntent({
      text: '你再试试',
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(intent).toMatchObject({
      kind: 'retry_request',
      target: 'unknown_prior_output',
      confidence: 'high',
      requiresPriorContext: true,
    });

    const block = renderInteractionIntentBlock(intent);
    expect(block).toContain('If prior context is unavailable');
    expect(block).toContain('one concise plain-text question');
    expect(block).toContain('Do not emit agent_interaction JSON');
  });

  test('keeps ordinary task requests out of the extra intent block', () => {
    const intent = classifyInteractionIntent({
      text: '帮我检查 git 状态并总结',
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(intent.kind).toBe('task_request');
    expect(renderInteractionIntentBlock(intent)).toBe('');
  });

  test('adds metric snapshot guidance for market quote requests without forcing cards', () => {
    const intent = classifyInteractionIntent({
      text: '看看指标 A 和指标 B 的行情',
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(intent.kind).toBe('task_request');
    expect(intent.presentation).toBeUndefined();
    expect(intent.guidance.join('\n')).toContain('metric_snapshot');
    expect(intent.guidance.join('\n')).toContain('Do not concatenate');
    expect(renderInteractionIntentBlock(intent)).toContain('<interaction_intent>');
  });

  test('activates Dynamic UI for visual task scenarios', () => {
    for (const text of [
      '对比一下 Codex CLI 和 app-server 的差异',
      '用图标说明这几个状态',
      '画一下当前 bridge 架构',
      '生成一份产品进展报告',
      '分析一下本周转化率和活跃用户趋势',
    ]) {
      const intent = classifyInteractionIntent({
        text,
        hasPriorContext: false,
        channel: 'feishu',
      });

      expect(intent.kind).toBe('task_request');
      expect(intent.presentation).toEqual({
        representation: 'interactive_card',
        source: 'dynamic_ui_heuristic',
      });
      expect(intent.guidance.join('\n')).toContain('Dynamic UI');
      expect(intent.guidance.join('\n')).toContain('Do not concatenate section headings');
      expect(renderInteractionIntentBlock(intent)).toContain('dynamic_ui_heuristic');
    }
  });

  test('keeps non-visual debugging analysis as ordinary task requests', () => {
    const intent = classifyInteractionIntent({
      text: '分析一下这个接口为什么失败',
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(intent.kind).toBe('task_request');
    expect(intent.presentation).toBeUndefined();
    expect(renderInteractionIntentBlock(intent)).toBe('');
  });

  test('treats explicit card feedback as a card-ready presentation request', () => {
    const text = '信息密度很高，且是有层次的，应该用飞书卡片嘛';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(intent.kind).toBe('presentation_feedback');
    expect(intent.presentation).toEqual({
      representation: 'interactive_card',
      source: 'explicit_user_feedback',
    });
    expect(requestsCardPresentation(text)).toBe(true);
    expect(intent.guidance.join('\n')).toContain('card-ready');
    expect(intent.guidance.join('\n')).toContain('do not describe a hypothetical card');
  });

  test('treats structure and visualization criticism as an interactive presentation request', () => {
    const text = '昨天晚上那个回复没有结构化和可视化';
    const intent = classifyInteractionIntent({
      text,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(intent.kind).toBe('presentation_feedback');
    expect(intent.presentation).toEqual({
      representation: 'interactive_card',
      source: 'explicit_user_feedback',
    });
    expect(intent.guidance.join('\n')).toContain('visual/card-ready');
  });

  test('uses a stateless judge only after rule-based classification stays at task fallback', async () => {
    let calls = 0;
    const intent = await classifyInteractionIntentWithJudge(
      {
        text: '换一种结构',
        hasPriorContext: true,
        channel: 'feishu',
      },
      {
        async classify() {
          calls += 1;
          return {
            kind: 'presentation_feedback',
            target: 'previous_agent_output',
            confidence: 'medium',
            requiresPriorContext: true,
            channel: 'feishu',
            guidance: ['Rewrite with clearer structure.'],
          };
        },
      },
    );

    expect(calls).toBe(1);
    expect(intent).toMatchObject({
      kind: 'presentation_feedback',
      target: 'previous_agent_output',
    });
  });

  test('does not call a stateless judge for high-confidence rule matches', async () => {
    let calls = 0;
    const intent = await classifyInteractionIntentWithJudge(
      {
        text: '你再试试',
        hasPriorContext: true,
        channel: 'feishu',
      },
      {
        async classify() {
          calls += 1;
          return undefined;
        },
      },
    );

    expect(calls).toBe(0);
    expect(intent.kind).toBe('retry_request');
  });
});
