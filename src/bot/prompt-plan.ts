import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { LocalAttachment } from '../media/cache';
import type { InteractionIntent, StatelessIntentJudge } from '../interaction/intent';
import type { GatewayMode, ReplyMentionTarget } from '../config/schema';
import { buildInteractionTurnPlanWithJudge } from '../runtime/interaction-runtime';
import {
  buildFeishuBridgeContext,
  renderFeishuMessageMetadataBlock,
  stripFeishuAttachmentRefs,
  toInteractionAttachments,
} from './intake-contract';
import { renderQuotedBlock, type QuotedContext } from './quote';

export interface BuiltFeishuPromptPlan {
  prompt: string;
  intent: InteractionIntent;
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
      ? [input.userTextOverride.trim()].filter(Boolean)
      : input.batch
          .map((message) => stripFeishuAttachmentRefs(message.content, fileKeys).trim())
          .filter(Boolean);
  const quoteBlock = renderQuotedBlock(input.quotes ?? []);
  const replyMentionTargets = renderReplyMentionTargets(input.replyMentionTargets);
  const metadataBlock = [
    renderFeishuMessageMetadataBlock(input.batch),
    renderReplyMentionTargetsBlock(replyMentionTargets),
  ].filter(Boolean).join('\n\n');
  const userText = texts.join('\n\n');
  if (input.gatewayMode === 'relay') {
    return {
      prompt: buildRelayPrompt({
        userText,
        quoteBlock,
        metadataBlock,
        attachments: toInteractionAttachments(input.attachments),
      }),
      intent: relayIntent(Boolean(input.hasPriorContext || quoteBlock)),
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
      quotedBlocks: quoteBlock ? [quoteBlock] : [],
      userText,
      attachments: toInteractionAttachments(input.attachments),
      hasPriorContext: Boolean(input.hasPriorContext || quoteBlock),
    },
    input.intentJudge,
  );
  return {
    prompt: plan.prompt,
    intent: plan.intent,
    userText,
  };
}

function buildRelayPrompt(input: {
  userText: string;
  quoteBlock: string;
  metadataBlock: string;
  attachments: ReturnType<typeof toInteractionAttachments>;
}): string {
  const text = input.userText || (input.attachments.length > 0 ? '请看下面的附件。' : '');
  const attachmentBlock = input.attachments.length > 0
    ? `附件（本地路径）：\n${renderRelayAttachmentLines(input.attachments)}`
    : '';
  return [
    input.quoteBlock,
    input.metadataBlock,
    text,
    attachmentBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
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
      const id = target.id?.trim();
      if (!name || !id) return '';
      return `@${name} id=${id}`;
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
