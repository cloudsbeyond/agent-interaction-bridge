import type { GatewayMode } from '../config/schema';

const PROTOCOL = `For destructive filesystem changes, remote writes, deploys, publishing, secret exposure, or external side effects, ask for approval before acting.
If approval is needed, emit one fenced JSON block only:
\`\`\`json
{"agent_interaction":{"id":"short-id","kind":"risk_approval","title":"Short title","summary":"Why approval is needed","risk":"Risk category","proposedAction":"Action","options":["approve","modify","reject","patch_only"]}}
\`\`\`
For normal answers, retries, presentation feedback, status, or missing context, reply normally.`;

const AGENT_SIGNAL_PROTOCOL = `When you need to initiate a separate human-facing update through the Bridge, emit one provider-neutral AgentSignal block:
<agent_signal>
{"agent_signal":{"id":"stable-id","kind":"status","title":"Short title","summary":"Human-facing summary","severity":"info","state":"optional-state"}}
</agent_signal>
Use the existing AgentSignal kinds only. The id is required and must be stable for retries.
Do not include chat, scope, carrier, session, endpoint profile, credentials, or delivery targets; Bridge derives and validates them from the active run.
Normal answers should remain normal text. Do not wrap the final answer in an AgentSignal unless it is intentionally a separate proactive update.`;

export type PresentationPromptMode = GatewayMode;

export type AgentPromptSectionKind =
  | 'interaction_protocol'
  | 'agent_signal_protocol'
  | 'presentation_hint'
  | 'plain_text_response_template'
  | 'bridge_context'
  | 'quoted_message'
  | 'carrier_metadata'
  | 'interaction_intent'
  | 'presentation_plan'
  | 'user_message'
  | 'attachments';

export interface AgentPromptSection {
  kind: AgentPromptSectionKind;
  content: string;
  attributes?: Readonly<Record<string, string>>;
}

export interface AgentPromptEnvelope {
  mode: GatewayMode;
  channel: string;
  sections: AgentPromptSection[];
}

const FEISHU_LARK_RUNTIME_PRESENTATION_HINT = `Feishu/Lark chat output: answer in the user's language, keep it compact, and use simple Markdown.
Put each heading, entity, bullet, label/value pair, and source URL on its own line.
Do not concatenate headings, labels, bullets, prices, ranges, or links.`;

const RELAY_PLAIN_TEXT_TEMPLATE = `Reply on a Feishu/Lark chat surface in the user's language.
Use simple line breaks and "- " bullets; keep each heading, label/value pair, and source URL on its own line.
Do not glue headings, labels, bullet items, numbers, ranges, or links together.`;

const SECTION_TAGS: Record<AgentPromptSectionKind, string> = {
  interaction_protocol: 'agent_interaction_protocol',
  agent_signal_protocol: 'agent_signal_protocol',
  presentation_hint: 'presentation_hint',
  plain_text_response_template: 'plain_text_response_template',
  bridge_context: 'bridge_context',
  quoted_message: 'quoted_message',
  carrier_metadata: 'carrier_metadata',
  interaction_intent: 'interaction_intent',
  presentation_plan: 'presentation_plan',
  user_message: 'user_message',
  attachments: 'attachments',
};

const SECTION_ORDER: Record<AgentPromptSectionKind, number> = {
  interaction_protocol: 0,
  agent_signal_protocol: 1,
  presentation_hint: 2,
  plain_text_response_template: 2,
  bridge_context: 3,
  quoted_message: 4,
  carrier_metadata: 5,
  interaction_intent: 6,
  presentation_plan: 7,
  user_message: 8,
  attachments: 9,
};

export function channelPresentationTemplate(
  channel: string | undefined,
  mode: PresentationPromptMode,
): string | undefined {
  if (mode === 'relay') {
    return renderAgentPromptSection({
      kind: 'plain_text_response_template',
      content: RELAY_PLAIN_TEXT_TEMPLATE,
    });
  }
  if (channel === 'feishu' || channel === 'lark' || channel === undefined) {
    return renderAgentPromptSection({
      kind: 'presentation_hint',
      content: FEISHU_LARK_RUNTIME_PRESENTATION_HINT,
    });
  }
  return undefined;
}

export function createAgentPromptEnvelope(input: {
  mode: GatewayMode;
  channel: string;
  sections: AgentPromptSection[];
}): AgentPromptEnvelope {
  const presentation = channelPresentationContent(input.channel, input.mode);
  const fixedSections: AgentPromptSection[] = input.mode === 'adapter'
    ? [
        { kind: 'interaction_protocol', content: PROTOCOL },
        { kind: 'agent_signal_protocol', content: AGENT_SIGNAL_PROTOCOL },
        ...(presentation ? [{ kind: 'presentation_hint' as const, content: presentation }] : []),
      ]
    : presentation
      ? [{ kind: 'plain_text_response_template', content: presentation }]
      : [];
  const fixedKinds = new Set(fixedSections.map((section) => section.kind));
  const sections = [
    ...fixedSections,
    ...input.sections.filter((section) => !fixedKinds.has(section.kind)),
  ]
    .map(normalizeAgentPromptSection)
    .filter((section) => Boolean(section.content))
    .map((section, index) => ({ section, index }))
    .sort((left, right) => (
      SECTION_ORDER[left.section.kind] - SECTION_ORDER[right.section.kind]
      || left.index - right.index
    ))
    .map(({ section }) => section);
  return {
    mode: input.mode,
    channel: input.channel,
    sections,
  };
}

export function renderAgentPrompt(envelope: AgentPromptEnvelope): string {
  return envelope.sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) => (
      SECTION_ORDER[left.section.kind] - SECTION_ORDER[right.section.kind]
      || left.index - right.index
    ))
    .map(({ section }) => section)
    .map(renderAgentPromptSection)
    .filter(Boolean)
    .join('\n\n');
}

export function renderAgentPromptSection(section: AgentPromptSection): string {
  const legacySequence = unwrapLegacySectionSequence(section);
  if (legacySequence) {
    return legacySequence
      .map(renderAgentPromptSection)
      .filter(Boolean)
      .join('\n\n');
  }
  const normalized = normalizeAgentPromptSection(section);
  if (!normalized.content) return '';
  const tag = SECTION_TAGS[normalized.kind];
  const attributes = Object.entries(normalized.attributes ?? {})
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ');
  const openingTag = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
  return `${openingTag}\n${normalized.content}\n</${tag}>`;
}

function unwrapLegacySectionSequence(
  section: AgentPromptSection,
): AgentPromptSection[] | undefined {
  const content = normalizeAgentPromptContent(section.content);
  const tag = SECTION_TAGS[section.kind];
  const pattern = new RegExp(
    `<${tag}(?:\\s+([^>]*))?>\\n?([\\s\\S]*?)\\n?<\\/${tag}>`,
    'gu',
  );
  const matches = Array.from(content.matchAll(pattern));
  if (matches.length < 2) return undefined;

  let cursor = 0;
  const sections: AgentPromptSection[] = [];
  for (const match of matches) {
    if (match.index === undefined || content.slice(cursor, match.index).trim()) return undefined;
    const attributes = parseLegacyAttributes(match[1] ?? '');
    sections.push({
      kind: section.kind,
      content: match[2] ?? '',
      ...((Object.keys(attributes).length > 0 || section.attributes)
        ? {
            attributes: {
              ...attributes,
              ...(section.attributes ?? {}),
            },
          }
        : {}),
    });
    cursor = match.index + match[0].length;
  }
  if (content.slice(cursor).trim()) return undefined;
  return sections;
}

export function normalizeAgentPromptSection(
  section: AgentPromptSection,
): AgentPromptSection {
  const content = normalizeAgentPromptContent(section.content);
  const legacy = unwrapLegacySection(section.kind, content);
  return {
    kind: section.kind,
    content: normalizeAgentPromptContent(legacy?.content ?? content),
    ...((legacy?.attributes || section.attributes)
      ? {
          attributes: {
            ...(legacy?.attributes ?? {}),
            ...(section.attributes ?? {}),
          },
        }
      : {}),
  };
}

export function normalizeAgentPromptContent(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && /^[\t ]*$/.test(lines[0] ?? '')) lines.shift();
  while (lines.length > 0 && /^[\t ]*$/.test(lines.at(-1) ?? '')) lines.pop();
  return lines.join('\n');
}

function channelPresentationContent(
  channel: string | undefined,
  mode: PresentationPromptMode,
): string | undefined {
  if (mode === 'relay') return RELAY_PLAIN_TEXT_TEMPLATE;
  return channel === 'feishu' || channel === 'lark' || channel === undefined
    ? FEISHU_LARK_RUNTIME_PRESENTATION_HINT
    : undefined;
}

function unwrapLegacySection(
  kind: AgentPromptSectionKind,
  value: string,
): { content: string; attributes?: Record<string, string> } | undefined {
  if (!value) return undefined;
  const tag = SECTION_TAGS[kind];
  const match = value.match(new RegExp(
    `^<${tag}(?:\\s+([^>]*))?>\\n?([\\s\\S]*?)\\n?<\\/${tag}>$`,
    'u',
  ));
  if (!match) return undefined;
  const body = match[2] ?? '';
  if (new RegExp(`<\\/?${tag}(?:\\s|>)`, 'u').test(body)) return undefined;
  const attributes = parseLegacyAttributes(match[1] ?? '');
  return {
    content: body,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  };
}

function parseLegacyAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_][\w:.-]*)="([^"]*)"/gu;
  for (const match of value.matchAll(attributePattern)) {
    const name = match[1];
    const attributeValue = match[2];
    if (name !== undefined && attributeValue !== undefined) {
      attributes[name] = unescapeAttribute(attributeValue);
    }
  }
  return attributes;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
