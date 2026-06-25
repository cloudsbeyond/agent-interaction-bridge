export type InteractionIntentKind =
  | 'task_request'
  | 'retry_request'
  | 'presentation_feedback';

export type InteractionIntentTarget =
  | 'current_message'
  | 'previous_agent_output'
  | 'unknown_prior_output';

export type InteractionIntentConfidence = 'low' | 'medium' | 'high';

export interface InteractionIntentInput {
  text: string;
  channel?: string;
  hasPriorContext?: boolean;
  hasQuotedContext?: boolean;
  hasAttachments?: boolean;
}

export interface InteractionIntent {
  kind: InteractionIntentKind;
  target: InteractionIntentTarget;
  confidence: InteractionIntentConfidence;
  requiresPriorContext: boolean;
  channel?: string;
  presentation?: InteractionPresentationPreference;
  guidance: string[];
}

export interface InteractionPresentationPreference {
  representation: 'interactive_card';
  source: 'explicit_user_feedback' | 'dynamic_ui_heuristic';
}

export interface StatelessIntentJudge {
  classify(input: InteractionIntentInput): Promise<InteractionIntent | undefined>;
}

const PRESENTATION_FEEDBACK_RE =
  /(很挫|一坨|太乱|太长|太密|太宽|不清晰|不够清楚|看不懂|不好读|读起来累|排版|表达|可视化|结构.*弱|图.*弱|markdown|卡片)/i;

const CARD_PRESENTATION_RE = /(?:飞书|lark|消息|交互)?卡片|\bcard\b/i;
const INTERACTIVE_PRESENTATION_RE =
  /(?:结构化|可视化|视觉化|图表化|图形化|卡片化|图文|看板|dashboard|chart|visual|interactive|card)/i;
const DYNAMIC_UI_RE =
  /(对比|比较|差异|取舍|vs\.?|versus|图标|icon|架构|architecture|报告|report|看板|dashboard|图表|chart|流程|flow|时间线|timeline|矩阵|matrix)/i;
const QUANTITATIVE_SIGNAL_RE =
  /(指标|数据|价格|股价|股票|行情|走势|最新价|涨跌|市值|估值|财报|财务|营收|收入|利润|毛利|现金流|增长|趋势|变化|区间|数量|占比|转化|留存|活跃|环比|同比|KPI|metric|metrics|data|price|quote|stock|market|finance|financial|revenue|profit|growth|trend|ratio|rate|conversion)/i;
const ANALYSIS_ACTION_RE = /(分析|解读|评估|研判|复盘|总结|预测|forecast|analysis|analyze|review)/i;
const METRIC_SNAPSHOT_ACTION_RE =
  /(看看|看一下|查|查询|给我|列一下|报一下|snapshot|quote|price|show|check)/i;

const RETRY_RE =
  /^(你)?再(试试|来|做|写|整理|优化|改)(一下|一次)?$|^(重试|重新来|重新写|重新整理|重新生成|换个说法|改一下|优化一下|再优化)$/i;

export function classifyInteractionIntent(input: InteractionIntentInput): InteractionIntent {
  const text = normalizeText(input.text);
  const hasPriorContext = Boolean(input.hasPriorContext || input.hasQuotedContext);

  if (!text && input.hasAttachments) return taskIntent(input.channel);

  if (shouldUseDynamicUi(text)) {
    return dynamicUiTaskIntent(input.channel);
  }

  if (shouldUseMetricSnapshot(text)) {
    return metricSnapshotTaskIntent(input.channel);
  }

  if (PRESENTATION_FEEDBACK_RE.test(text)) {
    const wantsInteractivePresentation = requestsInteractivePresentation(text);
    const cardGuidance = requestsCardPresentation(text)
      ? [
          'The runtime may use a card carrier for this turn; write card-ready blocks with compact labels and short values.',
          'Honor the requested presentation directly; do not describe a hypothetical card.',
        ]
      : wantsInteractivePresentation
        ? [
            'The runtime may use a visual/card carrier for this turn; rewrite as compact visual/card-ready blocks.',
            'Preserve the prior answer substance while making the structure visible.',
          ]
      : [];
    return {
      kind: 'presentation_feedback',
      target: hasPriorContext ? 'previous_agent_output' : 'unknown_prior_output',
      confidence: 'high',
      requiresPriorContext: true,
      channel: input.channel,
      presentation: wantsInteractivePresentation
        ? { representation: 'interactive_card', source: 'explicit_user_feedback' }
        : undefined,
      guidance: [
        'Treat this as feedback about the prior answer presentation, not as a new task.',
        'If prior context is available, rewrite the prior answer with the same substance and clearer structure.',
        'Use compact chat-native structure: short labels, short lines, and one decisive takeaway.',
        ...cardGuidance,
        'Do not emit agent_interaction JSON for ordinary feedback or presentation criticism.',
      ],
    };
  }

  if (RETRY_RE.test(text)) {
    return {
      kind: 'retry_request',
      target: hasPriorContext ? 'previous_agent_output' : 'unknown_prior_output',
      confidence: 'high',
      requiresPriorContext: true,
      channel: input.channel,
      guidance: [
        'Treat this as a request to retry or revise the prior answer.',
        'If prior context is available, retry the prior answer directly and make the improvement visible.',
        'If prior context is unavailable, ask one concise plain-text question for the missing target.',
        'Do not emit agent_interaction JSON for retry feedback or missing-context questions.',
      ],
    };
  }

  return taskIntent(input.channel);
}

export async function classifyInteractionIntentWithJudge(
  input: InteractionIntentInput,
  judge?: StatelessIntentJudge,
): Promise<InteractionIntent> {
  const ruleBased = classifyInteractionIntent(input);
  if (!judge || ruleBased.kind !== 'task_request' || ruleBased.confidence === 'high') return ruleBased;
  const judged = await judge.classify(input).catch(() => undefined);
  return judged ?? ruleBased;
}

export function renderInteractionIntentBlock(intent: InteractionIntent): string {
  if (intent.kind === 'task_request' && !intent.presentation && intent.guidance.length === 0) return '';
  return [
    '<interaction_intent>',
    `kind: ${intent.kind}`,
    `target: ${intent.target}`,
    `confidence: ${intent.confidence}`,
    `requires_prior_context: ${intent.requiresPriorContext ? 'true' : 'false'}`,
    intent.channel ? `channel: ${intent.channel}` : '',
    intent.presentation ? `presentation: ${intent.presentation.representation}` : '',
    intent.presentation ? `presentation_source: ${intent.presentation.source}` : '',
    'guidance:',
    ...intent.guidance.map((line) => `- ${line}`),
    '</interaction_intent>',
  ]
    .filter(Boolean)
    .join('\n');
}

function taskIntent(channel: string | undefined): InteractionIntent {
  return {
    kind: 'task_request',
    target: 'current_message',
    confidence: 'medium',
    requiresPriorContext: false,
    channel,
    guidance: [],
  };
}

function metricSnapshotTaskIntent(channel: string | undefined): InteractionIntent {
  return {
    ...taskIntent(channel),
    guidance: [
      'Use the Feishu/Lark metric_snapshot response template for source-backed numeric or market snapshots.',
      'Put the snapshot title, each entity heading, Quick read, and Sources on separate lines with a blank line between each entity or section.',
      'Every metric line must be a complete bullet that starts with "- ".',
      'Do not concatenate headings, labels, bullet items, entity names, prices, ranges, or source links.',
      'If source-backed data is unavailable, say that plainly instead of inventing values.',
    ],
  };
}

function dynamicUiTaskIntent(channel: string | undefined): InteractionIntent {
  return {
    ...taskIntent(channel),
    presentation: {
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
    },
    guidance: [
      'Dynamic UI is active for this turn because the request benefits from visual structure.',
      'Answer in a strict card-ready shape: one short title, then 3-5 standalone section headings, each followed by 1-3 short bullet lines.',
      'Do not concatenate section headings with content; put every heading on its own line.',
      'Do not write a single summary paragraph or bury the structure inside prose.',
      'For comparisons, use headings like 对比结论, A 侧, B 侧, 取舍, 建议.',
      'For architecture, use headings like 主链路, 组件, 执行端, 边界, 下一步.',
      'For reports, use headings like 状态, 完成, 进行中, 风险, 下一步.',
      'For source-backed metric or quantitative analysis, use headings like 结论, 关键指标, 趋势, 风险, 下一步.',
      'For charts, timelines, icons, or dashboards, use structured visual sections instead of dense paragraphs.',
      'Do not describe that Dynamic UI was selected; just produce the best visual/card-ready answer.',
    ],
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function requestsCardPresentation(text: string): boolean {
  return CARD_PRESENTATION_RE.test(normalizeText(text));
}

export function requestsInteractivePresentation(text: string): boolean {
  const normalized = normalizeText(text);
  return CARD_PRESENTATION_RE.test(normalized) || INTERACTIVE_PRESENTATION_RE.test(normalized);
}

export function shouldUseDynamicUi(text: string): boolean {
  const normalized = normalizeText(text);
  return DYNAMIC_UI_RE.test(normalized) ||
    (QUANTITATIVE_SIGNAL_RE.test(normalized) && ANALYSIS_ACTION_RE.test(normalized));
}

export function shouldUseMetricSnapshot(text: string): boolean {
  const normalized = normalizeText(text);
  return QUANTITATIVE_SIGNAL_RE.test(normalized) && METRIC_SNAPSHOT_ACTION_RE.test(normalized);
}
