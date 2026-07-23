import { describe, expect, it } from 'vitest';
import {
  channelPresentationTemplate,
  createAgentPromptEnvelope,
  normalizeAgentPromptContent,
  renderAgentPrompt,
  renderAgentPromptSection,
  type AgentPromptEnvelope,
} from './prompt';
import {
  FEISHU_LARK_SCENARIO_TEMPLATES,
  buildFeishuLarkPresentationContract,
} from './feishu-surface-templates';

describe('agent prompt envelope', () => {
  it('assembles adapter prompt sections once in deterministic order', () => {
    const envelope = createAgentPromptEnvelope({
      mode: 'adapter',
      channel: 'feishu',
      sections: [
        { kind: 'bridge_context', content: '<bridge_context>\nchat_type: p2p\n</bridge_context>' },
        { kind: 'user_message', content: '修复登录失败' },
      ],
    });

    expect(envelope.sections.map((section) => section.kind)).toEqual([
      'interaction_protocol',
      'agent_signal_protocol',
      'presentation_hint',
      'bridge_context',
      'user_message',
    ]);
    const prompt = renderAgentPrompt(envelope);
    expect(prompt).toBe([
      `<agent_interaction_protocol>
For destructive filesystem changes, remote writes, deploys, publishing, secret exposure, or external side effects, ask for approval before acting.
If approval is needed, emit one fenced JSON block only:
\`\`\`json
{"agent_interaction":{"id":"short-id","kind":"risk_approval","title":"Short title","summary":"Why approval is needed","risk":"Risk category","proposedAction":"Action","options":["approve","modify","reject","patch_only"]}}
\`\`\`
For normal answers, retries, presentation feedback, status, or missing context, reply normally.
</agent_interaction_protocol>`,
      `<agent_signal_protocol>
When you need to initiate a separate human-facing update through the Bridge, emit one provider-neutral AgentSignal block:
<agent_signal>
{"agent_signal":{"id":"stable-id","kind":"status","title":"Short title","summary":"Human-facing summary","severity":"info","state":"optional-state"}}
</agent_signal>
Use the existing AgentSignal kinds only. The id is required and must be stable for retries.
Do not include chat, scope, carrier, session, endpoint profile, credentials, or delivery targets; Bridge derives and validates them from the active run.
Normal answers should remain normal text. Do not wrap the final answer in an AgentSignal unless it is intentionally a separate proactive update.
</agent_signal_protocol>`,
      `<presentation_hint>
Feishu/Lark chat output: answer in the user's language, keep it compact, and use simple Markdown.
Put each heading, entity, bullet, label/value pair, and source URL on its own line.
Do not concatenate headings, labels, bullets, prices, ranges, or links.
</presentation_hint>`,
      '<bridge_context>\nchat_type: p2p\n</bridge_context>',
      '<user_message>\n修复登录失败\n</user_message>',
    ].join('\n\n'));
  });

  it('assembles relay prompts with only one response template', () => {
    const envelope = createAgentPromptEnvelope({
      mode: 'relay',
      channel: 'feishu',
      sections: [
        { kind: 'carrier_metadata', content: 'sender_type=app' },
        { kind: 'user_message', content: 'ping' },
      ],
    });

    expect(envelope.sections.map((section) => section.kind)).toEqual([
      'plain_text_response_template',
      'carrier_metadata',
      'user_message',
    ]);
    const prompt = renderAgentPrompt(envelope);
    expect(prompt).toBe([
      channelPresentationTemplate('feishu', 'relay'),
      '<carrier_metadata>\nsender_type=app\n</carrier_metadata>',
      '<user_message>\nping\n</user_message>',
    ].join('\n\n'));
    expect(prompt.match(/<plain_text_response_template>/g)).toHaveLength(1);
    expect(prompt).not.toContain('<agent_interaction_protocol>');
  });

  it('normalizes only outer blank lines and line endings while preserving body formatting', () => {
    const content = '\r\n \r\n  first\r\n\r\n```ts\r\n  const x = 1;\r\n```\r\n\t\r\n';

    expect(normalizeAgentPromptContent(content)).toBe(
      '  first\n\n```ts\n  const x = 1;\n```',
    );
    expect(renderAgentPromptSection({
      kind: 'user_message',
      content,
    })).toBe(
      '<user_message>\n  first\n\n```ts\n  const x = 1;\n```\n</user_message>',
    );
  });

  it('unwraps one legacy matching block and renders it exactly once', () => {
    const envelope = {
      mode: 'relay',
      channel: 'unknown-channel',
      sections: [{
        kind: 'user_message',
        content: '\n<user_message>\nlegacy body\n</user_message>\n',
      }],
    } satisfies AgentPromptEnvelope;

    expect(renderAgentPrompt(envelope)).toBe(
      '<user_message>\nlegacy body\n</user_message>',
    );
  });

  it('canonicalizes a legacy sequence of prewrapped quote blocks', () => {
    expect(renderAgentPromptSection({
      kind: 'quoted_message',
      content: [
        '<quoted_message sender_name="A" type="text">',
        'first',
        '</quoted_message>',
        '<quoted_message sender_name="B" type="post">',
        'second',
        '</quoted_message>',
      ].join('\n'),
    })).toBe([
      '<quoted_message sender_name="A" type="text">\nfirst\n</quoted_message>',
      '<quoted_message sender_name="B" type="post">\nsecond\n</quoted_message>',
    ].join('\n\n'));
  });

  it('escapes section attributes without escaping the section body', () => {
    expect(renderAgentPromptSection({
      kind: 'quoted_message',
      attributes: {
        sender_name: 'A & "B" <C>',
        type: 'text',
      },
      content: '<div>raw body</div>',
    })).toBe(
      '<quoted_message sender_name="A &amp; &quot;B&quot; &lt;C&gt;" type="text">\n'
      + '<div>raw body</div>\n'
      + '</quoted_message>',
    );
  });

  it('omits whitespace-only sections without adding outer or repeated separator lines', () => {
    const envelope = {
      mode: 'relay',
      channel: 'unknown-channel',
      sections: [
        { kind: 'carrier_metadata', content: '\r\n \t\r\n' },
        { kind: 'user_message', content: '\nhello\n' },
        { kind: 'attachments', content: '' },
      ],
    } satisfies AgentPromptEnvelope;

    const prompt = renderAgentPrompt(envelope);
    expect(prompt).toBe('<user_message>\nhello\n</user_message>');
    expect(prompt.startsWith('\n')).toBe(false);
    expect(prompt.endsWith('\n')).toBe(false);
    expect(prompt).not.toContain('\n\n\n');
  });

  it('enforces canonical section order when rendering a persisted envelope', () => {
    const envelope = {
      mode: 'adapter',
      channel: 'feishu',
      sections: [
        { kind: 'attachments', content: 'file' },
        { kind: 'user_message', content: 'task' },
        { kind: 'bridge_context', content: 'chat_type: p2p' },
      ],
    } satisfies AgentPromptEnvelope;

    expect(renderAgentPrompt(envelope)).toBe([
      '<bridge_context>\nchat_type: p2p\n</bridge_context>',
      '<user_message>\ntask\n</user_message>',
      '<attachments>\nfile\n</attachments>',
    ].join('\n\n'));
  });

  it('selects a concise known Feishu/Lark hint before falling back to runtime transforms', () => {
    expect(channelPresentationTemplate('feishu', 'adapter')).toContain('<presentation_hint>');
    expect(channelPresentationTemplate('lark', 'adapter')).toContain('<presentation_hint>');
    expect(channelPresentationTemplate('unknown-channel', 'adapter')).toBeUndefined();
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
