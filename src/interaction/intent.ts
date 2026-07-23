import { renderAgentPromptSection } from './prompt';

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
  guidance: string[];
}

export interface StatelessIntentJudge {
  classify(input: InteractionIntentInput): Promise<InteractionIntent | undefined>;
}

const PRESENTATION_FEEDBACK_RE =
  /(很挫|一坨|太乱|太长|太密|太宽|不清晰|不够清楚|看不懂|不好读|读起来累|排版|表达|可视化|结构.*弱|图.*弱|markdown|卡片)/i;

const RETRY_RE =
  /^(你)?再(试试|来|做|写|整理|优化|改)(一下|一次)?$|^(重试|重新来|重新写|重新整理|重新生成|换个说法|改一下|优化一下|再优化)$/i;

export function classifyInteractionIntent(input: InteractionIntentInput): InteractionIntent {
  const text = normalizeText(input.text);
  const hasPriorContext = Boolean(input.hasPriorContext || input.hasQuotedContext);

  if (!text && input.hasAttachments) return taskIntent(input.channel);

  if (PRESENTATION_FEEDBACK_RE.test(text)) {
    return {
      kind: 'presentation_feedback',
      target: hasPriorContext ? 'previous_agent_output' : 'unknown_prior_output',
      confidence: 'high',
      requiresPriorContext: true,
      channel: input.channel,
      guidance: [
        'Treat this as feedback about the prior answer presentation, not as a new task.',
        'If prior context is available, rewrite the prior answer with the same substance and clearer structure.',
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
  const content = renderInteractionIntentContent(intent);
  return content
    ? renderAgentPromptSection({ kind: 'interaction_intent', content })
    : '';
}

export function renderInteractionIntentContent(intent: InteractionIntent): string {
  if (intent.kind === 'task_request' && intent.guidance.length === 0) return '';
  return [
    `kind: ${intent.kind}`,
    `target: ${intent.target}`,
    `confidence: ${intent.confidence}`,
    `requires_prior_context: ${intent.requiresPriorContext ? 'true' : 'false'}`,
    intent.channel ? `channel: ${intent.channel}` : '',
    'guidance:',
    ...intent.guidance.map((line) => `- ${line}`),
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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
