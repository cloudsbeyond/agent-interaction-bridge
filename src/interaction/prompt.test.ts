import { describe, expect, it } from 'vitest';
import {
  channelPresentationTemplate,
  withInteractionProtocol,
  withRelayPlainTextTemplate,
} from './prompt';
import {
  FEISHU_LARK_SCENARIO_TEMPLATES,
  buildFeishuLarkPresentationContract,
} from './feishu-surface-templates';

describe('withInteractionProtocol', () => {
  it('prepends concise HITL instructions to the user prompt', () => {
    const prompt = withInteractionProtocol('修复登录失败');

    expect(prompt).toContain('<agent_interaction_protocol>');
    expect(prompt).toContain('<agent_signal_protocol>');
    expect(prompt).toContain('"agent_interaction"');
    expect(prompt).not.toContain('human_feedback');
    expect(prompt).toContain('risk_approval');
    expect(prompt).toContain('修复登录失败');
  });

  it('adds only a concise Feishu-oriented presentation hint for chat-facing answers', () => {
    const prompt = withInteractionProtocol('简述一下你的架构', { channel: 'feishu' });

    expect(prompt).toContain('<presentation_hint>');
    expect(prompt).toContain('Feishu/Lark chat output');
    expect(prompt).toContain('source URL on its own line');
    expect(prompt).not.toContain('<presentation_contract>');
    expect(prompt).not.toContain('Scenario templates:');
    expect(prompt).not.toContain('interactive_card_or_dynamic_ui');
  });

  it('selects a concise known Feishu/Lark hint before falling back to runtime transforms', () => {
    expect(channelPresentationTemplate('feishu', 'adapter')).toContain('<presentation_hint>');
    expect(channelPresentationTemplate('lark', 'adapter')).toContain('<presentation_hint>');
    expect(channelPresentationTemplate('unknown-channel', 'adapter')).toBeUndefined();
  });

  it('adds only a plain-text response template for relay mode', () => {
    const prompt = withRelayPlainTextTemplate('看看本周转化率和活跃用户趋势', { channel: 'feishu' });

    expect(prompt).toContain('<plain_text_response_template>');
    expect(prompt).toContain('Use simple line breaks and "- " bullets');
    expect(prompt).toContain('看看本周转化率和活跃用户趋势');
    expect(prompt).not.toContain('<agent_interaction_protocol>');
    expect(prompt).not.toContain('<agent_signal_protocol>');
    expect(prompt).not.toContain('<presentation_contract>');
    expect(prompt).not.toContain('<presentation_hint>');
    expect(prompt).not.toContain('interactive_card_or_dynamic_ui');
  });

  it('keeps Feishu/Lark scenario templates grounded in lark-cli carrier facts', () => {
    expect(FEISHU_LARK_SCENARIO_TEMPLATES.map((template) => template.id)).toEqual([
      'compact_chat_answer',
      'metric_snapshot',
      'status_or_progress_update',
      'comparison_or_decision',
      'exact_text_or_code',
      'interactive_card_or_dynamic_ui',
      'artifact_or_image_followup',
    ]);
    expect(buildFeishuLarkPresentationContract()).toContain('lark-cli im +messages-send --markdown');
    expect(buildFeishuLarkPresentationContract()).toContain('Card JSON 2.0');
    expect(buildFeishuLarkPresentationContract()).toContain('soft line breaks may be ignored');
  });
});
