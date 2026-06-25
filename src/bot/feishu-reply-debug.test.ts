import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { writeFeishuReplyDebugRecord } from './feishu-reply-debug';

describe('Feishu reply debug records', () => {
  test('persists raw agent text, rendered markdown, and send payload for replay', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'aib-reply-debug-'));
    const path = await writeFeishuReplyDebugRecord({
      appDir,
      scope: 'p2p:oc_123',
      chatId: 'oc_123',
      replyMode: 'text',
      rawText: '**指标快照**\n最新值：42',
      renderedText: '**指标快照**  \n最新值：42',
      payload: { markdown: '**指标快照**  \n最新值：42' },
    });

    expect(path).toContain(join(appDir, 'logs', 'feishu-replies'));
    const saved = JSON.parse(await readFile(path, 'utf8')) as {
      rawText: string;
      renderedText: string;
      payload: { markdown: string };
    };
    expect(saved.rawText).toBe('**指标快照**\n最新值：42');
    expect(saved.renderedText).toBe('**指标快照**  \n最新值：42');
    expect(saved.payload.markdown).toBe('**指标快照**  \n最新值：42');
  });
});
