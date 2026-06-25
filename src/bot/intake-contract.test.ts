import { describe, expect, test } from 'vitest';
import {
  buildFeishuBridgeContext,
  buildFeishuUserText,
  renderFeishuMessageMetadataBlock,
  stripFeishuAttachmentRefs,
  toInteractionAttachments,
} from './intake-contract';

describe('Feishu intake contract helpers', () => {
  test('normalizes bridge context without exposing provider payloads', () => {
    expect(
      buildFeishuBridgeContext({
        chatId: 'oc_1',
        chatType: 'group',
        senderId: 'ou_1',
        senderName: 'Ada',
        threadId: 'omt_1',
      }),
    ).toEqual({
      chat_id: 'oc_1',
      chat_type: 'group',
      sender_id: 'ou_1',
      sender_name: 'Ada',
      thread_id: 'omt_1',
    });
  });

  test('preserves raw sender and mention metadata as bounded carrier context', () => {
    const raw = {
      event_type: 'im.message.receive_v1',
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
            id: 'cli_bridge',
            name: 'Bridge Bot',
          },
        ],
      },
    };

    expect(
      buildFeishuBridgeContext({
        chatId: 'oc_1',
        chatType: 'group',
        senderId: 'ou_proxy_scoped',
        content: '@Bridge Bot ping',
        resources: [],
        raw,
      }),
    ).toMatchObject({
      sender_type: 'app',
      sender_app_id: 'cli_proxy',
      feishu_mentions: '@_user_1 name=Bridge Bot (id=cli_bridge)',
    });
    expect(
      renderFeishuMessageMetadataBlock([
        {
          content: '@Bridge Bot ping',
          resources: [],
          raw,
        },
      ]),
    ).toContain('sender_type=app sender_app_id=cli_proxy');
  });

  test('removes Feishu attachment markdown references before building user text', () => {
    const text = '请看文件 ![x](file_1) 和 [doc](file_2)\n继续分析';

    expect(stripFeishuAttachmentRefs(text, ['file_1', 'file_2'])).toBe(
      '请看文件  和 \n继续分析',
    );
    expect(
      buildFeishuUserText(
        [
          {
            content: text,
            resources: [{ fileKey: 'file_1' }, { fileKey: 'file_2' }],
          },
        ],
        [{ path: '/tmp/a.png', kind: 'image' }],
      ),
    ).toBe('请看文件  和 \n继续分析');
  });

  test('falls back to an attachment prompt and maps local attachments to runtime attachments', () => {
    expect(
      buildFeishuUserText(
        [{ content: '![x](file_1)', resources: [{ fileKey: 'file_1' }] }],
        [{ path: '/tmp/a.png', kind: 'image', originalName: 'a.png' }],
      ),
    ).toBe('请看下面的附件。');
    expect(
      toInteractionAttachments([
        { path: '/tmp/a.png', kind: 'image', originalName: 'a.png' },
        { path: '/tmp/a.mp3', kind: 'audio' },
      ]),
    ).toEqual([
      { path: '/tmp/a.png', label: '图片', originalName: 'a.png' },
      { path: '/tmp/a.mp3', label: '音频', originalName: undefined },
    ]);
  });
});
