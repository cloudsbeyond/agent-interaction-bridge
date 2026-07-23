import { describe, expect, test, vi } from 'vitest';
import {
  sendFeishuSignalInputs,
  type FeishuSignalMessageSender,
} from './feishu-signal-delivery';
import type { FeishuSendInput } from '../signal/feishu-delivery-support';

describe('Feishu signal delivery', () => {
  test('keeps secondary rich media send failures from failing the primary signal', async () => {
    const sent: FeishuSendInput[] = [];
    const sender: FeishuSignalMessageSender = {
      async send(_to, input) {
        sent.push(input);
        if ('image' in input) throw new Error('upload failed');
      },
    };
    const onSecondaryError = vi.fn();

    await expect(sendFeishuSignalInputs(
      sender,
      'chat-id',
      [
        { markdown: '图片已生成' },
        { image: { source: '/tmp/generated.png' } },
      ],
      undefined,
      onSecondaryError,
    )).resolves.toEqual({ primary: undefined });

    expect(sent).toEqual([
      { markdown: '图片已生成' },
      { image: { source: '/tmp/generated.png' } },
    ]);
    expect(onSecondaryError).toHaveBeenCalledWith(expect.any(Error), { image: { source: '/tmp/generated.png' } });
  });

  test('returns the primary carrier message id for reply correlation', async () => {
    const sender: FeishuSignalMessageSender = {
      async send() {
        return { messageId: 'om_proactive_1' };
      },
    };

    await expect(sendFeishuSignalInputs(
      sender,
      'chat-id',
      [{ markdown: '主动消息' }],
    )).resolves.toEqual({
      primary: { messageId: 'om_proactive_1' },
      messageId: 'om_proactive_1',
    });
  });

  test('still fails when the primary message cannot be sent', async () => {
    const sender: FeishuSignalMessageSender = {
      async send() {
        throw new Error('chat revoked');
      },
    };

    await expect(sendFeishuSignalInputs(
      sender,
      'chat-id',
      [{ markdown: '主消息' }],
    )).rejects.toThrow('chat revoked');
  });
});
