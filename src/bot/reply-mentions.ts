import type { LarkChannel, MentionInfo, NormalizedMessage, SendOptions } from '@larksuiteoapi/node-sdk';
import type { ReplyMentionTarget } from '../config/schema';
import { normalizeFeishuRawInboundEvent } from './feishu-raw-event-contract';

export type MarkdownReplyInput = { markdown: string } | { post: FeishuPost };

export interface FeishuPost {
  zh_cn: {
    title: string;
    content: FeishuPostElement[][];
  };
}

type FeishuPostElement =
  | { tag: 'at'; user_id: string; user_name?: string }
  | { tag: 'text'; text: string }
  | { tag: 'md'; text: string };

export function withReplyMentions(input: {
  sendOpts: SendOptions;
  batch: NormalizedMessage[];
  botOpenId?: string;
  body?: string;
  replyMentionTargets?: ReplyMentionTarget[];
}): SendOptions {
  const mentions: MentionInfo[] = [];
  const seen = new Set<string>();
  const add = (mention: MentionInfo | undefined): void => {
    if (!mention) return;
    const key = mention.openId ?? mention.key;
    if (!key || seen.has(key)) return;
    seen.add(key);
    mentions.push(mention);
  };

  for (const mention of input.sendOpts.mentions ?? []) add(mention);
  for (const mention of senderMentions(input.batch)) add(mention);
  for (const mention of bodyMentions(input.body, input.batch, input.botOpenId)) add(mention);
  for (const mention of configuredBodyMentions(input.body, input.replyMentionTargets)) add(mention);

  return mentions.length > 0 ? { ...input.sendOpts, mentions } : input.sendOpts;
}

export async function sendReplyMarkdown(
  channel: Pick<LarkChannel, 'send'>,
  chatId: string,
  markdown: string,
  sendOpts: SendOptions,
): Promise<unknown> {
  const planned = planReplyMarkdown(markdown, sendOpts);
  return channel.send(chatId, planned.input, planned.sendOpts);
}

export function planReplyMarkdown(
  markdown: string,
  sendOpts: SendOptions,
): { input: MarkdownReplyInput; sendOpts: SendOptions } {
  const { mentions = [], ...rest } = sendOpts;
  const validMentions = mentions.filter((mention) => Boolean(mention.openId));
  if (validMentions.length === 0) {
    return { input: { markdown }, sendOpts: rest };
  }
  return {
    input: { post: buildReplyPost(markdown, validMentions) },
    sendOpts: rest,
  };
}

export function buildReplyPost(markdown: string, mentions: MentionInfo[]): FeishuPost {
  const elements: FeishuPostElement[] = [];
  const validMentions = mentions.filter((mention) => Boolean(mention.openId));
  validMentions.forEach((mention, index) => {
    elements.push({
      tag: 'at',
      user_id: mention.openId as string,
      ...(mention.name ? { user_name: mention.name } : {}),
    });
    if (index < validMentions.length - 1) {
      elements.push({ tag: 'text', text: ' ' });
    }
  });
  const body = stripLeadingMentionText(markdown, validMentions);
  elements.push({
    tag: 'md',
    text: body.startsWith('\n') ? body : `\n${body}`,
  });
  return {
    zh_cn: {
      title: '',
      content: [elements],
    },
  };
}

function stripLeadingMentionText(markdown: string, mentions: MentionInfo[]): string {
  const names = mentions
    .map((mention) => mention.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return markdown;

  let body = markdown;
  const mentionName = names.map(escapeRegExp).join('|');
  const leadingMention = new RegExp(
    `^\\s*@(?:${mentionName})(?:[\\t ]+|\\n+|[，,、:：;；]\\s*|$)`,
    'u',
  );

  while (leadingMention.test(body)) {
    body = body.replace(leadingMention, '');
  }
  return body;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function senderMentions(batch: NormalizedMessage[]): MentionInfo[] {
  return batch
    .filter((message) => message.chatType !== 'p2p' && message.mentionedBot)
    .map(senderMention)
    .filter((mention): mention is MentionInfo => Boolean(mention));
}

function senderMention(message: NormalizedMessage): MentionInfo | undefined {
  const raw = normalizeFeishuRawInboundEvent(message.raw);
  const id = raw?.senderType === 'app' && raw.senderAppId
    ? raw.senderAppId
    : raw?.senderOpenId ?? message.senderId;
  if (!id) return undefined;
  return {
    key: `@sender_${id}`,
    openId: id,
    name: message.senderName ?? id,
  };
}

function bodyMentions(
  body: string | undefined,
  batch: NormalizedMessage[],
  botOpenId?: string,
): MentionInfo[] {
  if (!body) return [];
  const found: MentionInfo[] = [];
  for (const msg of batch) {
    for (const mention of msg.mentions ?? []) {
      if (!mention.openId || mention.openId === botOpenId) continue;
      const name = mention.name?.trim();
      if (!name || !body.includes(`@${name}`)) continue;
      found.push(mention);
    }
  }
  return found;
}

function configuredBodyMentions(
  body: string | undefined,
  targets: ReplyMentionTarget[] | undefined,
): MentionInfo[] {
  if (!body || !targets || targets.length === 0) return [];
  return targets
    .filter((target) => {
      const name = target.name?.trim();
      return Boolean(name && body.includes(`@${name}`));
    })
    .map((target) => {
      const name = target.name.trim();
      const id = target.id.trim();
      return {
        key: target.key?.trim() || `@${name}`,
        openId: id,
        name,
      };
    });
}
