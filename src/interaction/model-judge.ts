import type { RuntimeServicesPort } from '../runtime-services/port';
import type { LanguageCompleteOutput } from '../runtime-services/types';
import type {
  InteractionIntent,
  InteractionIntentInput,
  StatelessIntentJudge,
} from './intent';

export interface BridgeStatelessIntentJudgeOptions {
  runtime: RuntimeServicesPort;
}

export function createBridgeStatelessIntentJudge(
  options: BridgeStatelessIntentJudgeOptions,
): StatelessIntentJudge {
  const runtime = options.runtime;
  return {
    async classify(input: InteractionIntentInput): Promise<InteractionIntent | undefined> {
      const result = await runtime.call<{ input: string }, LanguageCompleteOutput>(
        'language.complete',
        { input: intentJudgePrompt(input) },
        { consumer: 'domain-agent', purpose: 'stateless InteractionIntent classification' },
      );
      if (result.status !== 'ok' || result.proposal?.kind !== 'text') return undefined;
      return parseIntent(result.proposal.text, input.channel);
    },
  };
}

function intentJudgePrompt(input: InteractionIntentInput): string {
  return [
    'You are a stateless InteractionIntent classifier inside agent-interaction-bridge.',
    'Authority boundary: classify user feedback only. Do not choose tools, approve risk, execute work, change cwd/session/profile, or produce Agent endpoint config.',
    'Return strict JSON with keys: kind, target, confidence, requiresPriorContext, presentation, guidance.',
    'Allowed kind: task_request, retry_request, presentation_feedback.',
    'Allowed target: current_message, previous_agent_output, unknown_prior_output.',
    'Allowed confidence: low, medium, high.',
    'presentation may be omitted or {"representation":"interactive_card","source":"explicit_user_feedback"} for direct presentation feedback.',
    'For task requests that benefit from visual structure, presentation may use source dynamic_ui_heuristic.',
    `channel: ${input.channel ?? ''}`,
    `has_prior_context: ${Boolean(input.hasPriorContext)}`,
    `has_quoted_context: ${Boolean(input.hasQuotedContext)}`,
    `has_attachments: ${Boolean(input.hasAttachments)}`,
    `user_text: ${input.text}`,
  ].join('\n');
}

function parseIntent(text: string, channel: string | undefined): InteractionIntent | undefined {
  const parsed = parseJsonObject(text);
  if (!parsed) return undefined;
  const kind = allowedValue(parsed.kind, ['task_request', 'retry_request', 'presentation_feedback'] as const);
  const target = allowedValue(parsed.target, ['current_message', 'previous_agent_output', 'unknown_prior_output'] as const);
  const confidence = allowedValue(parsed.confidence, ['low', 'medium', 'high'] as const);
  if (!kind || !target || !confidence) return undefined;
  const guidance = Array.isArray(parsed.guidance)
    ? parsed.guidance.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const presentation = parsePresentation(parsed.presentation);
  return {
    kind,
    target,
    confidence,
    requiresPriorContext: Boolean(parsed.requiresPriorContext ?? parsed.requires_prior_context),
    channel,
    ...(presentation ? { presentation } : {}),
    guidance,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function parsePresentation(value: unknown): InteractionIntent['presentation'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.representation !== 'interactive_card') return undefined;
  if (record.source !== 'explicit_user_feedback' && record.source !== 'dynamic_ui_heuristic') return undefined;
  return {
    representation: 'interactive_card',
    source: record.source,
  };
}

function allowedValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T[number] : undefined;
}
