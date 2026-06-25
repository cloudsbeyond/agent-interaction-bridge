import { describe, expect, test } from 'vitest';
import { buildInteractionTurnPlan, buildInteractionTurnPlanWithJudge } from './interaction-runtime';

describe('interaction runtime turn planning', () => {
  test('builds provider-neutral prompt context with interaction intent', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'feishu',
      context: {
        chat_id: 'oc_123',
        chat_type: 'p2p',
        sender_id: 'ou_456',
      },
      userText: '你再试试',
      hasPriorContext: false,
    });

    expect(plan.intent).toMatchObject({
      kind: 'retry_request',
      target: 'unknown_prior_output',
    });
    expect(plan.prompt).toContain('<bridge_context>');
    expect(plan.prompt).toContain('chat_id: oc_123');
    expect(plan.prompt).toContain('<interaction_intent>');
    expect(plan.prompt).toContain('kind: retry_request');
    expect(plan.prompt).toContain('你再试试');
  });

  test('keeps ordinary task prompts compact and free of extra intent blocks', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'cli',
      context: { cwd: '/work/project' },
      userText: 'run tests',
      hasPriorContext: false,
    });

    expect(plan.intent.kind).toBe('task_request');
    expect(plan.prompt).not.toContain('<interaction_intent>');
    expect(plan.prompt).toBe('<bridge_context>\ncwd: /work/project\n</bridge_context>\n\nrun tests');
  });

  test('adds Dynamic UI presentation guidance for visual task prompts', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'feishu',
      context: { chat_id: 'oc_123' },
      userText: '分析一下本周转化率和活跃用户趋势',
      hasPriorContext: false,
    });

    expect(plan.intent).toMatchObject({
      kind: 'task_request',
      presentation: {
        representation: 'interactive_card',
        source: 'dynamic_ui_heuristic',
      },
    });
    expect(plan.prompt).toContain('<interaction_intent>');
    expect(plan.prompt).toContain('Dynamic UI');
    expect(plan.prompt).toContain('strict card-ready shape');
    expect(plan.prompt).toContain('source-backed metric or quantitative analysis');
    expect(plan.prompt).toContain('Do not write a single summary paragraph');
  });

  test('renders attachments as channel-neutral local artifacts', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'feishu',
      context: { chat_id: 'oc_123' },
      userText: '',
      attachments: [
        {
          path: '/tmp/a.png',
          label: '图片',
          originalName: 'a.png',
        },
      ],
    });

    expect(plan.prompt).toContain('请看下面的附件。');
    expect(plan.prompt).toContain('附件（本地路径）：');
    expect(plan.prompt).toContain('- /tmp/a.png (a.png) — 图片');
  });

  test('can build a turn plan with an explicitly supplied stateless intent judge', async () => {
    const plan = await buildInteractionTurnPlanWithJudge(
      {
        channel: 'feishu',
        context: { chat_id: 'oc_123' },
        userText: '换一种结构',
        hasPriorContext: true,
      },
      {
        async classify() {
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

    expect(plan.intent.kind).toBe('presentation_feedback');
    expect(plan.prompt).toContain('Rewrite with clearer structure.');
  });
});
