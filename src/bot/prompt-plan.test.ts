import { describe, expect, test } from 'vitest';
import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { buildFeishuPromptPlan } from './prompt-plan';

describe('Feishu prompt planning', () => {
  test('uses an optional stateless judge at the InteractionIntent boundary', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('分析一下本周转化率和活跃用户趋势')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      intentJudge: {
        async classify() {
          return {
            kind: 'task_request',
            target: 'current_message',
            confidence: 'medium',
            requiresPriorContext: false,
            channel: 'feishu',
            presentation: {
              representation: 'interactive_card',
              source: 'dynamic_ui_heuristic',
            },
            guidance: ['Use a compact visual/card-ready analytical structure.'],
          };
        },
      },
    });

    expect(plan.intent.presentation).toEqual({
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
    });
    expect(plan.prompt).toContain('Use a compact visual/card-ready analytical structure.');
  });

  test('builds a channel relay prompt without bridge intent or context blocks', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('直接转给 agent')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      gatewayMode: 'relay',
    } as Parameters<typeof buildFeishuPromptPlan>[0] & { gatewayMode: 'relay' });

    expect(plan.prompt).toBe('直接转给 agent');
    expect(plan.prompt).not.toContain('<bridge_context>');
    expect(plan.prompt).not.toContain('<interaction_intent>');
    expect(plan.intent.kind).toBe('task_request');
  });

  test('keeps Feishu app sender and mention targets in relay prompt metadata', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [
        {
          ...message('给 发消息【ping】'),
          raw: rawReceiveEvent({
            senderType: 'app',
            senderAppId: 'cli_proxy',
            mentionId: 'cli_bridge',
            mentionName: 'Bridge Bot',
          }),
        } as unknown as NormalizedMessage,
      ],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      gatewayMode: 'relay',
    } as Parameters<typeof buildFeishuPromptPlan>[0] & { gatewayMode: 'relay' });

    expect(plan.prompt).toContain('飞书消息元数据');
    expect(plan.prompt).toContain('sender_type=app sender_app_id=cli_proxy');
    expect(plan.prompt).toContain('@_user_1 name=Bridge Bot (id=cli_bridge)');
    expect(plan.prompt).toContain('给 发消息【ping】');
    expect(plan.prompt).not.toContain('<bridge_context>');
  });

  test('passes configured outbound reply mention targets to the execution agent', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('@Reviewer ask Example Bot a status question')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      replyMentionTargets: [
        { name: 'Example Bot', id: 'cli_example_bot', key: '@Example Bot' },
      ],
    });

    expect(plan.prompt).toContain('<bridge_context>');
    expect(plan.prompt).toContain('reply_mention_targets: @Example Bot id=cli_example_bot');
  });

  test('passes configured outbound reply mention targets in relay mode metadata', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('@Reviewer ask Example Bot a status question')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      gatewayMode: 'relay',
      replyMentionTargets: [
        { name: 'Example Bot', id: 'cli_example_bot', key: '@Example Bot' },
      ],
    } as Parameters<typeof buildFeishuPromptPlan>[0] & { gatewayMode: 'relay' });

    expect(plan.prompt).toContain('飞书回复 mention 目标');
    expect(plan.prompt).toContain('@Example Bot id=cli_example_bot');
    expect(plan.prompt).not.toContain('<bridge_context>');
  });

  test('injects selected metric snapshot guidance for market quote questions', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('看看指标 A 和指标 B 的行情')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
    });

    expect(plan.prompt).toContain('<interaction_intent>');
    expect(plan.prompt).toContain('metric_snapshot');
    expect(plan.prompt).toContain('blank line between each entity');
    expect(plan.prompt).toContain('Do not concatenate');
  });
});

function message(content: string): NormalizedMessage {
  return {
    chatId: 'oc_123',
    chatType: 'p2p',
    senderId: 'ou_123',
    content,
    resources: [],
  } as unknown as NormalizedMessage;
}

function rawReceiveEvent(input: {
  senderType: string;
  senderAppId: string;
  mentionId: string;
  mentionName: string;
}) {
  return {
    event_type: 'im.message.receive_v1',
    sender: {
      sender_id: { app_id: input.senderAppId },
      sender_type: input.senderType,
    },
    message: {
      message_id: 'om_1',
      create_time: '1710000000000',
      chat_id: 'oc_123',
      chat_type: 'group',
      message_type: 'post',
      content: '{"title":"","content":[]}',
      mentions: [
        {
          key: '@_user_1',
          id: input.mentionId,
          name: input.mentionName,
        },
      ],
    },
  };
}
