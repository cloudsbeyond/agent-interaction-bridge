import type { PresentationLayout } from '../presentation/document';
import type { InteractionIntent } from './intent';
import { renderAgentPromptSection } from './prompt';

export type ExpressionProfileKind =
  | 'compact_chat_answer'
  | 'metric_snapshot'
  | 'architecture_explanation'
  | 'project_progress_report'
  | 'comparison'
  | 'visual';

export interface ExpressionProfile {
  kind: ExpressionProfileKind;
}

export type InteractionPresentationSource =
  | 'rule_based'
  | 'explicit_user_feedback'
  | 'dynamic_ui_heuristic';

export interface InteractionPresentationPlan {
  expressionProfile: ExpressionProfile;
  representation: 'text' | 'interactive_card';
  source: InteractionPresentationSource;
  layout?: PresentationLayout;
  density: 'compact';
  suggestedSections?: string[];
  requirements?: string[];
}

export interface InteractionPresentationInput {
  text: string;
  intent: InteractionIntent;
}

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

export function planInteractionPresentation(
  input: InteractionPresentationInput,
): InteractionPresentationPlan | undefined {
  const text = normalizeText(input.text);
  if (input.intent.kind === 'presentation_feedback') {
    return {
      expressionProfile: { kind: 'compact_chat_answer' },
      representation: requestsInteractivePresentation(text) ? 'interactive_card' : 'text',
      source: 'explicit_user_feedback',
      density: 'compact',
      suggestedSections: ['结论', '要点', '下一步'],
      requirements: ['Preserve the prior answer substance.'],
    };
  }
  if (shouldUseDynamicUi(text)) return dynamicUiPlan(text);
  if (shouldUseMetricSnapshot(text)) {
    return {
      expressionProfile: { kind: 'metric_snapshot' },
      representation: 'text',
      source: 'rule_based',
      density: 'compact',
      suggestedSections: ['快照', '解读', '来源'],
      requirements: [
        'Use complete metric bullets.',
        'State plainly when source-backed data is unavailable.',
      ],
    };
  }
  return undefined;
}

export function renderInteractionPresentationPlanBlock(
  plan: InteractionPresentationPlan | undefined,
): string {
  const content = renderInteractionPresentationPlanContent(plan);
  return content
    ? renderAgentPromptSection({ kind: 'presentation_plan', content })
    : '';
}

export function renderInteractionPresentationPlanContent(
  plan: InteractionPresentationPlan | undefined,
): string {
  if (!plan) return '';
  return [
    `expression_profile: ${plan.expressionProfile.kind}`,
    `representation: ${plan.representation}`,
    `source: ${plan.source}`,
    plan.layout ? `layout: ${plan.layout}` : '',
    `density: ${plan.density}`,
    plan.suggestedSections?.length
      ? `suggested_sections: ${plan.suggestedSections.join(' | ')}`
      : '',
    ...(plan.requirements?.length
      ? ['requirements:', ...plan.requirements.map((line) => `- ${line}`)]
      : []),
  ]
    .filter(Boolean)
    .join('\n');
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

function dynamicUiPlan(text: string): InteractionPresentationPlan {
  if (/(架构|architecture)/i.test(text)) {
    return {
      expressionProfile: { kind: 'architecture_explanation' },
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
      layout: 'architecture',
      density: 'compact',
      suggestedSections: ['主链路', '组件', '执行端', '边界', '下一步'],
    };
  }
  if (/(报告|report)/i.test(text)) {
    return {
      expressionProfile: { kind: 'project_progress_report' },
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
      layout: 'report',
      density: 'compact',
      suggestedSections: ['状态', '完成', '进行中', '风险', '下一步'],
    };
  }
  if (/(对比|比较|差异|取舍|vs\.?|versus)/i.test(text)) {
    return {
      expressionProfile: { kind: 'comparison' },
      representation: 'interactive_card',
      source: 'dynamic_ui_heuristic',
      layout: 'comparison',
      density: 'compact',
      suggestedSections: ['对比结论', 'A 侧', 'B 侧', '取舍', '建议'],
    };
  }
  return {
    expressionProfile: { kind: 'visual' },
    representation: 'interactive_card',
    source: 'dynamic_ui_heuristic',
    layout: 'visual',
    density: 'compact',
    suggestedSections: ['结论', '关键指标', '趋势', '风险', '下一步'],
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
