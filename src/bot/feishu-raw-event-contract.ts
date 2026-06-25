export const FEISHU_INBOUND_EVENT_TYPE = 'im.message.receive_v1';

export interface FeishuRawInboundMessage {
  eventId?: string;
  eventType: typeof FEISHU_INBOUND_EVENT_TYPE;
  tenantKey?: string;
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  content: string;
  senderOpenId?: string;
  senderUserId?: string;
  senderAppId?: string;
  senderType?: string;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  createTime: string;
  mentionKeys: string[];
  mentions: FeishuRawMention[];
}

export interface FeishuRawMention {
  key: string;
  name?: string;
  openId?: string;
  userId?: string;
  unionId?: string;
  appId?: string;
  id?: string;
}

export interface FeishuRawInboundEventValidation {
  ok: boolean;
  failures: string[];
  normalized?: FeishuRawInboundMessage;
}

export function validateFeishuRawInboundEvent(raw: unknown): FeishuRawInboundEventValidation {
  const failures: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, failures: ['raw_event.object'] };
  }

  const obj = raw as Record<string, unknown>;
  const message = objectField(obj, 'message');
  const sender = objectField(obj, 'sender');
  const senderId = objectField(sender, 'sender_id');

  const eventType = stringField(obj, 'event_type');
  if (eventType !== FEISHU_INBOUND_EVENT_TYPE) failures.push('event_type.receive_v1');

  const messageId = stringField(message, 'message_id');
  const chatId = stringField(message, 'chat_id');
  const chatType = stringField(message, 'chat_type');
  const messageType = stringField(message, 'message_type');
  const content = stringField(message, 'content');
  const createTime = stringField(message, 'create_time');

  if (!message) failures.push('message.object');
  if (!messageId) failures.push('message.message_id');
  if (!chatId) failures.push('message.chat_id');
  if (!chatType) failures.push('message.chat_type');
  if (!messageType) failures.push('message.message_type');
  if (content === undefined) failures.push('message.content');
  if (!createTime) failures.push('message.create_time');

  if (failures.length > 0) return { ok: false, failures };

  const normalizedMentions = mentions(message);
  return {
    ok: true,
    failures: [],
    normalized: {
      eventId: stringField(obj, 'event_id'),
      eventType: FEISHU_INBOUND_EVENT_TYPE,
      tenantKey: stringField(obj, 'tenant_key'),
      messageId: messageId as string,
      chatId: chatId as string,
      chatType: chatType as string,
      messageType: messageType as string,
      content: content as string,
      senderOpenId: stringField(senderId, 'open_id'),
      senderUserId: stringField(senderId, 'user_id'),
      senderAppId: stringField(senderId, 'app_id'),
      senderType: stringField(sender, 'sender_type'),
      rootId: stringField(message, 'root_id'),
      parentId: stringField(message, 'parent_id'),
      threadId: stringField(message, 'thread_id'),
      createTime: createTime as string,
      mentions: normalizedMentions,
      mentionKeys: normalizedMentions.map((mention) => mention.key),
    },
  };
}

export function normalizeFeishuRawInboundEvent(raw: unknown): FeishuRawInboundMessage | undefined {
  return validateFeishuRawInboundEvent(raw).normalized;
}

function objectField(
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function mentions(message: Record<string, unknown> | undefined): FeishuRawMention[] {
  const rawMentions = message?.mentions;
  if (!Array.isArray(rawMentions)) return [];
  return rawMentions
    .map((mention): FeishuRawMention | undefined => {
      if (!mention || typeof mention !== 'object') return undefined;
      const item = mention as Record<string, unknown>;
      const key = item.key;
      if (typeof key !== 'string' || !key) return undefined;
      const id = item.id;
      const idObject = id && typeof id === 'object' && !Array.isArray(id)
        ? (id as Record<string, unknown>)
        : undefined;
      return {
        key,
        ...optionalString('name', stringField(item, 'name')),
        ...optionalString('openId', stringField(idObject, 'open_id')),
        ...optionalString('userId', stringField(idObject, 'user_id')),
        ...optionalString('unionId', stringField(idObject, 'union_id')),
        ...optionalString('appId', stringField(idObject, 'app_id')),
        ...optionalString('id', typeof id === 'string' ? id : undefined),
      };
    })
    .filter((mention): mention is FeishuRawMention => Boolean(mention));
}

function optionalString<Key extends string>(key: Key, value: string | undefined): { [K in Key]?: string } {
  return value ? { [key]: value } as { [K in Key]?: string } : {};
}
