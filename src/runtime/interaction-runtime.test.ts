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
    expect(plan.sections.map((section) => section.kind)).toEqual([
      'bridge_context',
      'interaction_intent',
      'user_message',
    ]);
    expect(section(plan, 'bridge_context')).toContain('chat_id: oc_123');
    expect(section(plan, 'interaction_intent')).toContain('kind: retry_request');
    expect(section(plan, 'user_message')).toBe('你再试试');
  });

  test('keeps ordinary task prompts compact and free of extra intent blocks', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'cli',
      context: { cwd: '/work/project' },
      userText: 'run tests',
      hasPriorContext: false,
    });

    expect(plan.intent.kind).toBe('task_request');
    expect(plan.sections.map((item) => item.kind)).toEqual([
      'bridge_context',
      'user_message',
    ]);
    expect(section(plan, 'interaction_intent')).toBe('');
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
    });
    expect(plan.intent).not.toHaveProperty('presentation');
    expect(plan.presentationPlan).toMatchObject({
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
      layout: 'visual',
    });
    expect(section(plan, 'interaction_intent')).toBe('');
    expect(section(plan, 'presentation_plan')).toContain('expression_profile: visual');
    expect(section(plan, 'presentation_plan')).not.toContain('<presentation_plan>');
    expect(section(plan, 'presentation_plan')).not.toContain('Do not concatenate section headings');
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

    expect(section(plan, 'user_message')).toBe('请看下面的附件。');
    expect(section(plan, 'attachments')).toContain('附件（本地路径）：');
    expect(section(plan, 'attachments')).toContain('- /tmp/a.png (a.png) — 图片');
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
    expect(section(plan, 'interaction_intent')).toContain('Rewrite with clearer structure.');
  });

  test('keeps user markdown and code whitespace while normalizing outer blank lines', () => {
    const plan = buildInteractionTurnPlan({
      channel: 'feishu',
      context: {},
      userText: '\r\n \r\n  heading\r\n\r\n```ts\r\n  const x = 1;\r\n```\r\n',
    });

    expect(section(plan, 'user_message')).toBe(
      '  heading\n\n```ts\n  const x = 1;\n```',
    );
  });
});

function section(
  plan: ReturnType<typeof buildInteractionTurnPlan>,
  kind: string,
): string {
  return plan.sections.find((item) => item.kind === kind)?.content ?? '';
}
