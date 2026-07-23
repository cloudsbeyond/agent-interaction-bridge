import { describe, expect, test } from 'vitest';
import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { renderAgentPrompt } from '../interaction/prompt';
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
            guidance: [],
          };
        },
      },
    });

    expect(plan.intent).not.toHaveProperty('presentation');
    expect(plan.presentationPlan).toMatchObject({
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
    });
    expect(plan.envelope.sections.map((section) => section.kind)).toEqual([
      'interaction_protocol',
      'agent_signal_protocol',
      'presentation_hint',
      'bridge_context',
      'presentation_plan',
      'user_message',
    ]);
    expect(renderAgentPrompt(plan.envelope)).toContain('<presentation_plan>');
    expect(renderAgentPrompt(plan.envelope)).toContain(
      '<user_message>\n分析一下本周转化率和活跃用户趋势\n</user_message>',
    );
  });

  test('builds a channel relay prompt without bridge intent or context blocks', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('直接转给 agent')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
      gatewayMode: 'relay',
    } as Parameters<typeof buildFeishuPromptPlan>[0] & { gatewayMode: 'relay' });

    const prompt = renderAgentPrompt(plan.envelope);
    expect(plan.envelope.sections.map((section) => section.kind)).toEqual([
      'plain_text_response_template',
      'user_message',
    ]);
    expect(prompt).toContain('直接转给 agent');
    expect(prompt).not.toContain('<bridge_context>');
    expect(prompt).not.toContain('<interaction_intent>');
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

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt).toContain('飞书消息语义（不代表执行授权）');
    expect(prompt).toContain('<carrier_metadata>');
    expect(prompt).toContain('sender_type=app');
    expect(prompt).toContain('mentions: @Bridge Bot');
    expect(prompt).not.toContain('cli_proxy');
    expect(prompt).not.toContain('cli_bridge');
    expect(prompt).toContain('给 发消息【ping】');
    expect(prompt).not.toContain('<bridge_context>');
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

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt).toContain('<bridge_context>');
    expect(prompt).toContain('reply_mention_targets: @Example Bot');
    expect(prompt).not.toContain('cli_example_bot');
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

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt).toContain('飞书回复 mention 目标');
    expect(prompt).toContain('@Example Bot');
    expect(prompt).not.toContain('cli_example_bot');
    expect(prompt).not.toContain('<bridge_context>');
  });

  test('keeps quoted carrier identifiers out of the Domain Agent prompt', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('继续处理')],
      attachments: [],
      quotes: [{
        messageId: 'om_provider_message',
        senderId: 'ou_provider_sender',
        senderName: 'Ada',
        createdAt: '2026-07-23T00:00:00.000Z',
        content: '上一轮内容',
        rawContentType: 'text',
      }],
      hasPriorContext: true,
    });

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt).toContain('<quoted_message');
    expect(prompt).toContain('sender_name="Ada"');
    expect(prompt).toContain('上一轮内容');
    expect(prompt).not.toContain('om_provider_message');
    expect(prompt).not.toContain('ou_provider_sender');
  });

  test('renders each quoted message once with escaped attributes and canonical blank lines', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('继续处理')],
      attachments: [],
      quotes: [
        {
          messageId: 'om_1',
          senderId: 'ou_1',
          senderName: 'A & "B"',
          createdAt: '2026-07-23T00:00:00.000Z',
          content: '第一段',
          rawContentType: 'text',
        },
        {
          messageId: 'om_2',
          senderId: 'ou_2',
          senderName: 'C',
          createdAt: '2026-07-23T00:01:00.000Z',
          content: '第二段',
          rawContentType: 'post',
        },
      ],
      hasPriorContext: true,
    });

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt.match(/<quoted_message /g)).toHaveLength(2);
    expect(prompt).toContain('sender_name="A &amp; &quot;B&quot;"');
    expect(prompt).toContain(
      '</quoted_message>\n\n<quoted_message sender_name="C"',
    );
    expect(prompt.match(/<user_message>/g)).toHaveLength(1);
  });

  test('injects selected metric snapshot guidance for market quote questions', async () => {
    const plan = await buildFeishuPromptPlan({
      batch: [message('看看指标 A 和指标 B 的行情')],
      attachments: [],
      quotes: [],
      hasPriorContext: false,
    });

    const prompt = renderAgentPrompt(plan.envelope);
    expect(prompt).not.toContain('<interaction_intent>');
    expect(prompt).toContain('<presentation_plan>');
    expect(prompt).toContain('metric_snapshot');
    expect(prompt).toContain('State plainly when source-backed data is unavailable.');
    expect(prompt.match(/Do not concatenate headings/g)).toHaveLength(1);
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
