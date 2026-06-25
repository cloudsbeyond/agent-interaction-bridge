export type FeishuLarkCarrierFit =
  | 'text'
  | 'post_markdown'
  | 'interactive_card'
  | 'media_followup';

export interface FeishuLarkScenarioTemplate {
  id: string;
  carrierFit: FeishuLarkCarrierFit;
  appliesWhen: string;
  template: string[];
}

export const FEISHU_LARK_SCENARIO_TEMPLATES: FeishuLarkScenarioTemplate[] = [
  {
    id: 'compact_chat_answer',
    carrierFit: 'post_markdown',
    appliesWhen: 'Default answer, explanation, summary, or short investigation note.',
    template: [
      '**<short title>**',
      '**Takeaway**',
      '- <one direct answer>',
      '**Details**',
      '- <fact 1>',
      '- <fact 2>',
    ],
  },
  {
    id: 'metric_snapshot',
    carrierFit: 'post_markdown',
    appliesWhen: 'Source-backed metric snapshot, KPI status, or numeric comparison.',
    template: [
      '**<snapshot title>**',
      '**<entity, metric, or cohort A>**',
      '- <label>: <value>',
      '- <change/range/status>: <value>',
      '**<entity, metric, or cohort B>**',
      '- <label>: <value>',
      '- <change/range/status>: <value>',
      '**Quick read**',
      '- <interpretation 1>',
      '- <interpretation 2>',
      '**Sources**',
      '- <source name>: <url>',
    ],
  },
  {
    id: 'status_or_progress_update',
    carrierFit: 'interactive_card',
    appliesWhen: 'Long-running run state, build progress, verification summary, or operational status.',
    template: [
      '**Status**',
      '- Current: <state>',
      '- Done: <completed checks>',
      '- Next: <next action>',
      '- Risk: <only if present>',
    ],
  },
  {
    id: 'comparison_or_decision',
    carrierFit: 'interactive_card',
    appliesWhen: 'A/B tradeoff, architecture choice, product decision, or option review.',
    template: [
      '**Decision**',
      '- <recommended option and why>',
      '**A**',
      '- <strength>',
      '- <risk>',
      '**B**',
      '- <strength>',
      '- <risk>',
    ],
  },
  {
    id: 'exact_text_or_code',
    carrierFit: 'text',
    appliesWhen: 'Logs, code, stack traces, command output, indentation-sensitive text, or literal Markdown.',
    template: [
      '<preserve exact line breaks and indentation>',
      '<do not rewrite literal Markdown into rich prose>',
    ],
  },
  {
    id: 'interactive_card_or_dynamic_ui',
    carrierFit: 'interactive_card',
    appliesWhen: 'Explicit user request for card, visual structure, dashboard, comparison blocks, choice, or approval.',
    template: [
      '**<card title>**',
      '- Keep one screen on mobile.',
      '- Use sections, columns, metric grid, or collapsed details only when they reduce scanning cost.',
      '- Keep execution authority and approval semantics outside presentation styling.',
    ],
  },
  {
    id: 'artifact_or_image_followup',
    carrierFit: 'media_followup',
    appliesWhen: 'Generated image, screenshot, diagram, report file, or other artifact is part of the answer.',
    template: [
      '**Result**',
      '- Primary answer stays readable as text/card.',
      '- Media or file follows as a separate Feishu/Lark payload.',
      '- If media upload fails, keep the primary answer useful.',
    ],
  },
];

const FEISHU_LARK_CARRIER_FACTS = [
  'lark-cli im +messages-send --markdown and +messages-reply --markdown convert lightweight Markdown into Feishu post payloads; use this shape for headings, lists, links, summaries, and reports.',
  'Use exact text for logs, code, indentation-sensitive output, or literal Markdown; do not depend on Markdown conversion when byte-for-byte formatting matters.',
  'Use Card JSON 2.0 / interactive cards for rich structure, streaming run state, choices, approvals, metric grids, comparisons, and Dynamic UI.',
  'Card JSON 2.0 markdown soft line breaks may be ignored; keep labels and bullet items on separate lines and use explicit hard breaks when constructing card payloads.',
  'Images and files are separate media payloads; do not refer to local file paths inside Markdown. Use uploaded image/file keys or a follow-up media send.',
];

export function buildFeishuLarkPresentationContract(): string {
  return [
    '<presentation_contract>',
    'You are answering inside Feishu/Lark, usually on a narrow mobile or chat card surface.',
    'Carrier facts:',
    ...FEISHU_LARK_CARRIER_FACTS.map((fact) => `- ${fact}`),
    'For chat-facing final answers:',
    '- Match the user language and be direct.',
    '- Rich means clearer structure, not more content.',
    '- Prefer one-screen answers: short title, 2-4 compact sections, and one decisive takeaway.',
    '- Use whitespace and short labels for scanning.',
    '- avoid dense tables, long nested lists, decorative framing, and repeated architecture prose.',
    '- Do not use fenced code blocks for chat-facing architecture summaries; use short plain lines instead.',
    '- Do not include internal tool citation markers such as turnNviewM or dagger line markers.',
    '- Do not concatenate headings, labels, or bullet items into one line.',
    '- When the user criticizes the presentation, diagnose the presentation issue first and rewrite with less density.',
    'Scenario templates:',
    ...FEISHU_LARK_SCENARIO_TEMPLATES.flatMap(renderScenarioTemplate),
    '</presentation_contract>',
  ].join('\n');
}

function renderScenarioTemplate(template: FeishuLarkScenarioTemplate): string[] {
  return [
    `- ${template.id} [${template.carrierFit}]: ${template.appliesWhen}`,
    ...template.template.map((line) => `  ${line}`),
  ];
}
