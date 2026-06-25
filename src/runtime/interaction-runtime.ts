import {
  classifyInteractionIntent,
  classifyInteractionIntentWithJudge,
  renderInteractionIntentBlock,
  type InteractionIntent,
  type StatelessIntentJudge,
} from '../interaction/intent';
import type { ChannelId } from '../signal/router';

export interface InteractionAttachment {
  path: string;
  label: string;
  originalName?: string;
}

export interface InteractionTurnInput {
  channel: ChannelId;
  context: Record<string, string | number | boolean | undefined>;
  userText: string;
  quotedBlocks?: string[];
  attachments?: InteractionAttachment[];
  hasPriorContext?: boolean;
}

export interface InteractionTurnPlan {
  channel: ChannelId;
  intent: InteractionIntent;
  prompt: string;
}

export function buildInteractionTurnPlan(input: InteractionTurnInput): InteractionTurnPlan {
  const intentInput = interactionIntentInput(input);
  return buildInteractionTurnPlanFromIntent(input, classifyInteractionIntent(intentInput));
}

export async function buildInteractionTurnPlanWithJudge(
  input: InteractionTurnInput,
  judge?: StatelessIntentJudge,
): Promise<InteractionTurnPlan> {
  const intent = await classifyInteractionIntentWithJudge(interactionIntentInput(input), judge);
  return buildInteractionTurnPlanFromIntent(input, intent);
}

function buildInteractionTurnPlanFromIntent(
  input: InteractionTurnInput,
  intent: InteractionIntent,
): InteractionTurnPlan {
  const quotedBlocks = (input.quotedBlocks ?? []).filter(Boolean);
  const attachments = input.attachments ?? [];
  const userText = input.userText.trim();
  const intentBlock = renderInteractionIntentBlock(intent);

  const prefixParts = [
    renderContextBlock(input.context),
    ...quotedBlocks,
    intentBlock,
  ].filter(Boolean);
  const userPart = userText || (attachments.length > 0 ? '请看下面的附件。' : '');
  const body = attachments.length > 0
    ? `${userPart}\n\n附件（本地路径）：\n${renderAttachmentLines(attachments)}`
    : userPart;
  const prefix = prefixParts.length > 0 ? `${prefixParts.join('\n\n')}\n\n` : '';
  return {
    channel: input.channel,
    intent,
    prompt: `${prefix}${body}`.trim(),
  };
}

function interactionIntentInput(input: InteractionTurnInput) {
  const quotedBlocks = (input.quotedBlocks ?? []).filter(Boolean);
  const attachments = input.attachments ?? [];
  return {
    text: input.userText.trim(),
    channel: input.channel,
    hasPriorContext: Boolean(input.hasPriorContext || quotedBlocks.length > 0),
    hasQuotedContext: quotedBlocks.length > 0,
    hasAttachments: attachments.length > 0,
  };
}

export function renderContextBlock(context: InteractionTurnInput['context']): string {
  const lines = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
  if (lines.length === 0) return '';
  return ['<bridge_context>', ...lines, '</bridge_context>'].join('\n');
}

function renderAttachmentLines(attachments: InteractionAttachment[]): string {
  return attachments
    .map((attachment) => {
      const name = attachment.originalName ? ` (${attachment.originalName})` : '';
      return `- ${attachment.path}${name} — ${attachment.label}`;
    })
    .join('\n');
}
