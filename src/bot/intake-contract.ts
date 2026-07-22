import type { InteractionAttachment } from '../runtime/interaction-runtime';
import type { LocalAttachment } from '../media/cache';
import { normalizeFeishuRawInboundEvent, type FeishuRawMention } from './feishu-raw-event-contract';

export interface FeishuIntakeResource {
  fileKey: string;
}

export interface FeishuIntakeMessage {
  messageId?: string;
  chatId?: string;
  chatType?: string;
  senderId?: string;
  senderName?: string;
  threadId?: string;
  content: string;
  resources: FeishuIntakeResource[];
  raw?: unknown;
}

export function buildFeishuBridgeContext(
  message: Partial<FeishuIntakeMessage> | undefined,
  batch: Partial<FeishuIntakeMessage>[] = message ? [message] : [],
): Record<string, string | undefined> {
  if (!message) return {};
  const raw = normalizeFeishuRawInboundEvent(message.raw);
  const mentions = feishuMentionsSummary(batch);
  return {
    chat_id: message.chatId,
    chat_type: message.chatType,
    sender_id: message.senderId,
    sender_name: message.senderName,
    sender_type: raw?.senderType,
    sender_open_id: raw?.senderOpenId,
    sender_app_id: raw?.senderAppId,
    thread_id: message.threadId,
    feishu_mentions: mentions,
  };
}

export function renderFeishuMessageMetadataBlock(
  batch: Partial<FeishuIntakeMessage>[],
): string {
  const lines = batch.flatMap((message) => {
    const raw = normalizeFeishuRawInboundEvent(message.raw);
    if (!raw) return [];
    const senderParts = [
      raw.senderType ? `sender_type=${raw.senderType}` : '',
      raw.senderOpenId ? `sender_open_id=${raw.senderOpenId}` : '',
      raw.senderAppId ? `sender_app_id=${raw.senderAppId}` : '',
    ].filter(Boolean);
    const mentionSummary = raw.mentions.length > 0
      ? raw.mentions.map(formatMention).join('; ')
      : '';
    if (senderParts.length === 0 && !mentionSummary) return [];
    return [
      `- message_id=${raw.messageId}${senderParts.length > 0 ? ` ${senderParts.join(' ')}` : ''}`,
      ...(mentionSummary ? [`  mentions: ${mentionSummary}`] : []),
    ];
  });
  if (lines.length === 0) return '';
  return [
    '飞书消息元数据（仅用于解析 sender 与 @ 对象，不代表执行授权）：',
    ...lines,
  ].join('\n');
}

export function buildFeishuUserText(
  batch: FeishuIntakeMessage[],
  attachments: LocalAttachment[],
): string {
  const fileKeys = batch.flatMap((message) => message.resources.map((resource) => resource.fileKey));
  const texts = batch
    .map((message) => stripFeishuAttachmentRefs(message.content, fileKeys).trim())
    .filter(Boolean);
  if (texts.length > 0) return texts.join('\n\n');
  return attachments.length > 0 ? '请看下面的附件。' : '';
}

export function normalizeFeishuCommandContent(content: string): string {
  const trimmed = content.trim();
  const match = /^```(?:(plain_text|plaintext|text))?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(
    trimmed,
  );
  if (!match) return content;
  const lines = (match[2] ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 1 && lines[0]?.startsWith('/') ? lines[0] : content;
}

export function toInteractionAttachments(
  attachments: LocalAttachment[],
): InteractionAttachment[] {
  return attachments.map((attachment) => ({
    path: attachment.path,
    label: attachmentLabel(attachment.kind),
    originalName: attachment.originalName,
  }));
}

export function stripFeishuAttachmentRefs(text: string, fileKeys: string[]): string {
  if (!text || fileKeys.length === 0) return text;
  let out = text;
  for (const key of fileKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`!?\\[[^\\]]*\\]\\(${escaped}\\)`, 'g'), '');
  }
  return out;
}

function attachmentLabel(kind: LocalAttachment['kind']): string {
  if (kind === 'image') return '图片';
  if (kind === 'audio') return '音频';
  if (kind === 'video') return '视频';
  return '文件';
}

function feishuMentionsSummary(batch: Partial<FeishuIntakeMessage>[]): string | undefined {
  const summary = batch
    .flatMap((message) => normalizeFeishuRawInboundEvent(message.raw)?.mentions ?? [])
    .map(formatMention)
    .filter(Boolean)
    .join('; ');
  return summary || undefined;
}

function formatMention(mention: FeishuRawMention): string {
  const identity = [
    mention.openId ? `open_id=${mention.openId}` : '',
    mention.userId ? `user_id=${mention.userId}` : '',
    mention.unionId ? `union_id=${mention.unionId}` : '',
    mention.appId ? `app_id=${mention.appId}` : '',
    mention.id ? `id=${mention.id}` : '',
  ].filter(Boolean).join(',');
  const name = mention.name ? ` name=${mention.name}` : '';
  return identity ? `${mention.key}${name} (${identity})` : `${mention.key}${name}`;
}
