const PROTOCOL = `<agent_interaction_protocol>
For destructive filesystem changes, remote writes, deploys, publishing, secret exposure, or external side effects, ask for approval before acting.
If approval is needed, emit one fenced JSON block only:
\`\`\`json
{"agent_interaction":{"id":"short-id","kind":"risk_approval","title":"Short title","summary":"Why approval is needed","risk":"Risk category","proposedAction":"Action","options":["approve","modify","reject","patch_only"]}}
\`\`\`
For normal answers, retries, presentation feedback, status, or missing context, reply normally.
</agent_interaction_protocol>`;

const AGENT_SIGNAL_PROTOCOL = `<agent_signal_protocol>
When you need to initiate a separate human-facing update through the Bridge, emit one provider-neutral AgentSignal block:
<agent_signal>
{"agent_signal":{"id":"stable-id","kind":"status","title":"Short title","summary":"Human-facing summary","severity":"info","state":"optional-state"}}
</agent_signal>
Use the existing AgentSignal kinds only. The id is required and must be stable for retries.
Do not include chat, scope, carrier, session, endpoint profile, credentials, or delivery targets; Bridge derives and validates them from the active run.
Normal answers should remain normal text. Do not wrap the final answer in an AgentSignal unless it is intentionally a separate proactive update.
</agent_signal_protocol>`;

export type PresentationPromptMode = 'adapter' | 'relay';

const FEISHU_LARK_RUNTIME_PRESENTATION_HINT = `<presentation_hint>
Feishu/Lark chat output: answer in the user's language, keep it compact, and use simple Markdown.
Put each heading, entity, bullet, label/value pair, and source URL on its own line.
Do not concatenate headings, labels, bullets, prices, ranges, or links.
</presentation_hint>`;

const RELAY_PLAIN_TEXT_TEMPLATE = `<plain_text_response_template>
Reply on a Feishu/Lark chat surface in the user's language.
Use simple line breaks and "- " bullets; keep each heading, label/value pair, and source URL on its own line.
Do not glue headings, labels, bullet items, numbers, ranges, or links together.
</plain_text_response_template>`;

export function channelPresentationTemplate(
  channel: string | undefined,
  mode: PresentationPromptMode,
): string | undefined {
  if (mode === 'relay') return RELAY_PLAIN_TEXT_TEMPLATE;
  if (channel === 'feishu' || channel === 'lark' || channel === undefined) {
    return FEISHU_LARK_RUNTIME_PRESENTATION_HINT;
  }
  return undefined;
}

export function withInteractionProtocol(
  prompt: string,
  options: { channel?: string } = {},
): string {
  const presentation = channelPresentationTemplate(options.channel, 'adapter');
  return [
    PROTOCOL,
    AGENT_SIGNAL_PROTOCOL,
    presentation,
    prompt,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function withRelayPlainTextTemplate(
  prompt: string,
  options: { channel?: string } = {},
): string {
  return [
    channelPresentationTemplate(options.channel, 'relay'),
    prompt,
  ]
    .filter(Boolean)
    .join('\n\n');
}
