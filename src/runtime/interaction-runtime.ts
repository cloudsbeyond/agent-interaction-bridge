import {
  classifyInteractionIntent,
  classifyInteractionIntentWithJudge,
  renderInteractionIntentContent,
  type InteractionIntent,
  type StatelessIntentJudge,
} from '../interaction/intent';
import type { ChannelId } from '../signal/router';
import {
  planInteractionPresentation,
  renderInteractionPresentationPlanContent,
  type InteractionPresentationPlan,
} from '../interaction/presentation-plan';
import {
  normalizeAgentPromptContent,
  normalizeAgentPromptSection,
  renderAgentPromptSection,
  type AgentPromptSection,
} from '../interaction/prompt';

export interface InteractionAttachment {
  path: string;
  label: string;
  originalName?: string;
}

export interface InteractionTurnInput {
  channel: ChannelId;
  context: Record<string, string | number | boolean | undefined>;
  userText: string;
  quotedSections?: AgentPromptSection[];
  /** @deprecated Pass raw `quotedSections` instead. */
  quotedBlocks?: string[];
  attachments?: InteractionAttachment[];
  hasPriorContext?: boolean;
}

export interface InteractionTurnPlan {
  channel: ChannelId;
  intent: InteractionIntent;
  presentationPlan?: InteractionPresentationPlan;
  sections: AgentPromptSection[];
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
  const quotedSections = collectQuotedSections(input);
  const attachments = input.attachments ?? [];
  const userText = normalizeAgentPromptContent(input.userText);
  const intentContent = renderInteractionIntentContent(intent);
  const presentationPlan = planInteractionPresentation({ text: userText, intent });
  const presentationContent = renderInteractionPresentationPlanContent(presentationPlan);

  const userPart = userText || (attachments.length > 0 ? '请看下面的附件。' : '');
  const sectionCandidates: AgentPromptSection[] = [
    { kind: 'bridge_context', content: renderContextContent(input.context) },
    ...quotedSections,
    { kind: 'interaction_intent', content: intentContent },
    { kind: 'presentation_plan', content: presentationContent },
    { kind: 'user_message', content: userPart },
    {
      kind: 'attachments',
      content: attachments.length > 0
        ? `附件（本地路径）：\n${renderAttachmentLines(attachments)}`
        : '',
    },
  ];
  const sections = sectionCandidates
    .map(normalizeAgentPromptSection)
    .filter((section) => Boolean(section.content));
  return {
    channel: input.channel,
    intent,
    ...(presentationPlan ? { presentationPlan } : {}),
    sections,
  };
}

function interactionIntentInput(input: InteractionTurnInput) {
  const quotedSections = collectQuotedSections(input);
  const attachments = input.attachments ?? [];
  return {
    text: normalizeAgentPromptContent(input.userText),
    channel: input.channel,
    hasPriorContext: Boolean(input.hasPriorContext || quotedSections.length > 0),
    hasQuotedContext: quotedSections.length > 0,
    hasAttachments: attachments.length > 0,
  };
}

export function renderContextBlock(context: InteractionTurnInput['context']): string {
  const content = renderContextContent(context);
  return content
    ? renderAgentPromptSection({ kind: 'bridge_context', content })
    : '';
}

export function renderContextContent(context: InteractionTurnInput['context']): string {
  const lines = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
  return lines.join('\n');
}

function collectQuotedSections(input: InteractionTurnInput): AgentPromptSection[] {
  return [
    ...(input.quotedSections ?? []).map((section): AgentPromptSection => ({
      ...section,
      kind: 'quoted_message',
    })),
    ...(input.quotedBlocks ?? []).map((content): AgentPromptSection => ({
      kind: 'quoted_message',
      content,
    })),
  ]
    .map(normalizeAgentPromptSection)
    .filter((section) => Boolean(section.content));
}

function renderAttachmentLines(attachments: InteractionAttachment[]): string {
  return attachments
    .map((attachment) => {
      const name = attachment.originalName ? ` (${attachment.originalName})` : '';
      return `- ${attachment.path}${name} — ${attachment.label}`;
    })
    .join('\n');
}
