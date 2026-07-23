import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { LocalAttachment } from '../media/cache';
import type { InteractionIntent, StatelessIntentJudge } from '../interaction/intent';
import type { GatewayMode, ReplyMentionTarget } from '../config/schema';
import type { InteractionPresentationPlan } from '../interaction/presentation-plan';
import {
  createAgentPromptEnvelope,
  normalizeAgentPromptContent,
  type AgentPromptEnvelope,
  type AgentPromptSection,
} from '../interaction/prompt';
import { buildInteractionTurnPlanWithJudge } from '../runtime/interaction-runtime';
import {
  buildFeishuBridgeContext,
  renderFeishuMessageMetadataBlock,
  stripFeishuAttachmentRefs,
  toInteractionAttachments,
} from './intake-contract';
import { buildQuotedPromptSections, type QuotedContext } from './quote';

export interface BuiltFeishuPromptPlan {
  envelope: AgentPromptEnvelope;
  intent: InteractionIntent;
  presentationPlan?: InteractionPresentationPlan;
  userText: string;
}

export interface BuildFeishuPromptPlanInput {
  batch: NormalizedMessage[];
  attachments: LocalAttachment[];
  quotes?: QuotedContext[];
  userTextOverride?: string;
  hasPriorContext?: boolean;
  intentJudge?: StatelessIntentJudge;
  gatewayMode?: GatewayMode;
  replyMentionTargets?: ReplyMentionTarget[];
}

export async function buildFeishuPromptPlan(
  input: BuildFeishuPromptPlanInput,
): Promise<BuiltFeishuPromptPlan> {
  const fileKeys = input.batch.flatMap((message) => message.resources.map((resource) => resource.fileKey));
  const texts =
    input.userTextOverride !== undefined
      ? [normalizeAgentPromptContent(input.userTextOverride)].filter(Boolean)
      : input.batch
          .map((message) => normalizeAgentPromptContent(
            stripFeishuAttachmentRefs(message.content, fileKeys),
          ))
          .filter(Boolean);
  const quotedSections = buildQuotedPromptSections(input.quotes ?? []);
  const replyMentionTargets = renderReplyMentionTargets(input.replyMentionTargets);
  const metadataBlock = [
    renderFeishuMessageMetadataBlock(input.batch),
    renderReplyMentionTargetsBlock(replyMentionTargets),
  ].filter(Boolean).join('\n\n');
  const userText = texts.join('\n\n');
  const gatewayMode = input.gatewayMode ?? 'adapter';
  if (gatewayMode === 'relay') {
    return {
      envelope: createAgentPromptEnvelope({
        mode: gatewayMode,
        channel: 'feishu',
        sections: buildRelayPromptSections({
          userText,
          quotedSections,
          metadataBlock,
          attachments: toInteractionAttachments(input.attachments),
        }),
      }),
      intent: relayIntent(Boolean(input.hasPriorContext || quotedSections.length > 0)),
      userText,
    };
  }
  const plan = await buildInteractionTurnPlanWithJudge(
    {
      channel: 'feishu',
      context: {
        ...buildFeishuBridgeContext(input.batch[0], input.batch),
        reply_mention_targets: replyMentionTargets,
      },
      quotedSections,
      userText,
      attachments: toInteractionAttachments(input.attachments),
      hasPriorContext: Boolean(input.hasPriorContext || quotedSections.length > 0),
    },
    input.intentJudge,
  );
  return {
    envelope: createAgentPromptEnvelope({
      mode: gatewayMode,
      channel: 'feishu',
      sections: plan.sections,
    }),
    intent: plan.intent,
    ...(plan.presentationPlan ? { presentationPlan: plan.presentationPlan } : {}),
    userText,
  };
}

function buildRelayPromptSections(input: {
  userText: string;
  quotedSections: AgentPromptSection[];
  metadataBlock: string;
  attachments: ReturnType<typeof toInteractionAttachments>;
}): AgentPromptSection[] {
  const text = input.userText || (input.attachments.length > 0 ? '请看下面的附件。' : '');
  const attachmentBlock = input.attachments.length > 0
    ? `附件（本地路径）：\n${renderRelayAttachmentLines(input.attachments)}`
    : '';
  return [
    ...input.quotedSections,
    { kind: 'carrier_metadata', content: input.metadataBlock },
    { kind: 'user_message', content: text },
    { kind: 'attachments', content: attachmentBlock },
  ].filter((section): section is AgentPromptSection => Boolean(section.content));
}

function relayIntent(requiresPriorContext: boolean): InteractionIntent {
  return {
    kind: 'task_request',
    target: 'current_message',
    confidence: 'medium',
    requiresPriorContext,
    channel: 'feishu',
    guidance: [],
  };
}

function renderRelayAttachmentLines(
  attachments: ReturnType<typeof toInteractionAttachments>,
): string {
  return attachments
    .map((attachment) => {
      const name = attachment.originalName ? ` (${attachment.originalName})` : '';
      return `- ${attachment.path}${name} — ${attachment.label}`;
    })
    .join('\n');
}

function renderReplyMentionTargets(
  targets: ReplyMentionTarget[] | undefined,
): string | undefined {
  const lines = (targets ?? [])
    .map((target) => {
      const name = target.name?.trim();
      if (!name) return '';
      return `@${name.replace(/^@+/u, '')}`;
    })
    .filter(Boolean);
  return lines.length > 0 ? lines.join('; ') : undefined;
}

function renderReplyMentionTargetsBlock(summary: string | undefined): string {
  if (!summary) return '';
  return [
    '飞书回复 mention 目标（bridge 会把回复正文中的 @name 降成真实 at 节点）：',
    summary,
  ].join('\n');
}
