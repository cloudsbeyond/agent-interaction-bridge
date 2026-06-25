import { describe, expect, test } from 'vitest';
import { planReplyMarkdown, withReplyMentions, type FeishuPost } from './reply-mentions';

describe('reply mention lowering', () => {
  test('consumes leading textual mentions after lowering them to Feishu at nodes', () => {
    const planned = planReplyMarkdown(
      '@Example Bot\n[trace_id=example_trace_1]\nstatus=ok',
      {
        replyTo: 'om_123',
        mentions: [
          { key: '@sender_cli_proxy_app', openId: 'cli_proxy_app', name: 'Example Bot' },
        ],
      },
    );

    expect(planned.input).toEqual({ post: expect.any(Object) });
    expect(planned.sendOpts).toEqual({ replyTo: 'om_123' });

    const paragraph = firstParagraph((planned.input as { post: FeishuPost }).post);
    expect(paragraph).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'at', user_id: 'cli_proxy_app', user_name: 'Example Bot' }),
    ]));
    expect(markdownText((planned.input as { post: FeishuPost }).post)).toContain('[trace_id=example_trace_1]');
    expect(markdownText((planned.input as { post: FeishuPost }).post)).not.toContain('@Example Bot');
  });

  test('lowers configured reply mention targets even when the inbound message did not mention them', () => {
    const body = '@Example Bot\n[trace_id=example_trace_2]\nQuestion:\nCan you inspect the raw message envelope?';
    const planned = planReplyMarkdown(
      body,
      withReplyMentions({
        sendOpts: {
          replyTo: 'om_123',
        },
        batch: [],
        body,
        replyMentionTargets: [
          { name: 'Example Bot', id: 'cli_example_bot', key: '@reply_target_example_bot' },
        ],
      }),
    );

    const post = (planned.input as { post: FeishuPost }).post;
    expect(firstParagraph(post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'at', user_id: 'cli_example_bot', user_name: 'Example Bot' }),
    ]));
    expect(markdownText(post)).toContain('[trace_id=example_trace_2]');
    expect(markdownText(post)).not.toContain('@Example Bot');
  });
});

function firstParagraph(post: FeishuPost): Array<Record<string, unknown>> {
  return post.zh_cn.content[0] ?? [];
}

function markdownText(post: FeishuPost): string {
  return firstParagraph(post)
    .filter((element) => element.tag === 'md')
    .map((element) => String(element.text ?? ''))
    .join('\n');
}
