import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FeishuReplyDebugRecordInput {
  appDir: string;
  scope: string;
  chatId: string;
  replyMode: string;
  rawText: string;
  renderedText: string;
  payload: unknown;
}

export async function writeFeishuReplyDebugRecord(input: FeishuReplyDebugRecordInput): Promise<string> {
  const dir = join(input.appDir, 'logs', 'feishu-replies');
  await mkdir(dir, { recursive: true });
  const createdAt = new Date().toISOString();
  const path = join(dir, `${safeTimestamp(createdAt)}-${safeFilePart(input.scope)}.json`);
  await writeFile(path, `${JSON.stringify({
    schema: 'agent-interaction-bridge.feishu-reply-debug.v1',
    createdAt,
    scope: input.scope,
    chatId: input.chatId,
    replyMode: input.replyMode,
    rawText: input.rawText,
    renderedText: input.renderedText,
    payload: input.payload,
  }, null, 2)}\n`, 'utf8');
  return path;
}

function safeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80) || 'reply';
}
