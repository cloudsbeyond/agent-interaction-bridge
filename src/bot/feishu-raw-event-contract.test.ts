import { describe, expect, test } from 'vitest';
import {
  FEISHU_INBOUND_EVENT_TYPE,
  normalizeFeishuRawInboundEvent,
  validateFeishuRawInboundEvent,
} from './feishu-raw-event-contract';

describe('Feishu raw inbound event contract', () => {
  test('normalizes the minimal raw receive_v1 message schema behind the carrier boundary', () => {
    const normalized = normalizeFeishuRawInboundEvent({
      event_id: 'evt-1',
      event_type: FEISHU_INBOUND_EVENT_TYPE,
      tenant_key: 'tenant-1',
      sender: {
        sender_id: { open_id: 'ou_1', user_id: 'u_1' },
        sender_type: 'user',
      },
      message: {
        message_id: 'om_1',
        root_id: 'root_1',
        parent_id: 'parent_1',
        create_time: '1710000000000',
        chat_id: 'oc_1',
        thread_id: 'omt_1',
        chat_type: 'group',
        message_type: 'text',
        content: '{"text":"hello"}',
        mentions: [
          {
            key: '@_user_1',
            id: { open_id: 'ou_2' },
            name: 'Ada',
          },
        ],
      },
    });

    expect(normalized).toEqual({
      eventId: 'evt-1',
      eventType: 'im.message.receive_v1',
      tenantKey: 'tenant-1',
      messageId: 'om_1',
      chatId: 'oc_1',
      chatType: 'group',
      messageType: 'text',
      content: '{"text":"hello"}',
      senderOpenId: 'ou_1',
      senderUserId: 'u_1',
      senderAppId: undefined,
      senderType: 'user',
      rootId: 'root_1',
      parentId: 'parent_1',
      threadId: 'omt_1',
      createTime: '1710000000000',
      mentionKeys: ['@_user_1'],
      mentions: [
        {
          key: '@_user_1',
          name: 'Ada',
          openId: 'ou_2',
        },
      ],
    });
  });

  test('normalizes app senders and app mention ids for proxy-agent messages', () => {
    const normalized = normalizeFeishuRawInboundEvent({
      event_type: FEISHU_INBOUND_EVENT_TYPE,
      sender: {
        sender_id: { app_id: 'cli_proxy' },
        sender_type: 'app',
      },
      message: {
        message_id: 'om_1',
        create_time: '1710000000000',
        chat_id: 'oc_1',
        chat_type: 'group',
        message_type: 'post',
        content: '{"title":"","content":[]}',
        mentions: [
          {
            key: '@_user_1',
            id: 'cli_target_bot',
            name: 'Bridge Bot',
          },
        ],
      },
    });

    expect(normalized?.senderType).toBe('app');
    expect(normalized?.senderAppId).toBe('cli_proxy');
    expect(normalized?.mentions).toEqual([
      {
        key: '@_user_1',
        name: 'Bridge Bot',
        id: 'cli_target_bot',
      },
    ]);
  });

  test('reports missing required fields without leaking raw provider payloads', () => {
    const result = validateFeishuRawInboundEvent({
      event_type: FEISHU_INBOUND_EVENT_TYPE,
      sender: { sender_type: 'user' },
      message: { message_id: 'om_1', chat_id: 'oc_1', content: '{}' },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      'message.chat_type',
      'message.message_type',
      'message.create_time',
    ]);
    expect(result.normalized).toBeUndefined();
  });

  test('ignores unknown raw events instead of treating them as generic runtime input', () => {
    expect(validateFeishuRawInboundEvent(undefined)).toEqual({
      ok: false,
      failures: ['raw_event.object'],
    });
    expect(
      validateFeishuRawInboundEvent({
        event_type: 'card.action.trigger',
        message: {},
      }).failures,
    ).toContain('event_type.receive_v1');
  });
});
