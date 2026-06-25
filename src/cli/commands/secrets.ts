import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { getSecret, listSecretIds, removeSecret, setSecret } from '../../config/keystore';

/**
 * `secrets` CLI surface. Two intended consumers:
 *
 * 1. Humans: `agent-interaction-bridge secrets set/list/remove` to manage
 *    Feishu/Lark app secrets in the encrypted bridge keystore.
 *
 * 2. Companion operator tools that implement the exec-provider protocol:
 *    `agent-interaction-bridge secrets get` reads a JSON-RPC request from
 *    stdin and writes the decrypted secret to stdout. This is what
 *    `accounts.app.secret = { source: "exec", ... }` resolves through.
 */

interface ExecRequest {
  protocolVersion?: number;
  provider?: string;
  ids?: string[];
}

interface ExecResponseValue {
  protocolVersion: number;
  values: Record<string, string>;
  errors?: Record<string, { message: string }>;
}

const PROTOCOL_VERSION = 1;

/**
 * `secrets get` — exec-provider protocol mode.
 *
 * Reads a JSON object from stdin:
 *   { "protocolVersion": 1, "provider": "<name>", "ids": ["app-cli_xxx", ...] }
 *
 * Writes a JSON object to stdout:
 *   { "protocolVersion": 1, "values": { "app-cli_xxx": "..." } }
 *
 * Missing entries land in `errors` rather than `values` — caller decides.
 * Process exits 0 on a successful protocol exchange (even with per-id
 * errors). Non-zero exit means we couldn't parse stdin or the keystore
 * file itself is broken.
 */
export async function runSecretsGet(): Promise<void> {
  const input = await readAllStdin();
  let req: ExecRequest;
  try {
    req = JSON.parse(input || '{}') as ExecRequest;
  } catch (err) {
    console.error(`secrets get: invalid stdin JSON: ${(err as Error).message}`);
    process.exit(2);
  }
  const ids = req.ids ?? [];
  const resp: ExecResponseValue = {
    protocolVersion: PROTOCOL_VERSION,
    values: {},
  };
  for (const id of ids) {
    try {
      const v = await getSecret(id);
      if (v !== undefined) {
        resp.values[id] = v;
      } else {
        (resp.errors ??= {})[id] = { message: 'not found' };
      }
    } catch (err) {
      (resp.errors ??= {})[id] = { message: (err as Error).message };
    }
  }
  process.stdout.write(`${JSON.stringify(resp)}\n`);
}

export interface SecretEntryCliOptions {
  appId?: string;
  id?: string;
}

export function secretEntryForCli(opts: SecretEntryCliOptions): { id: string; label: string } {
  const id = opts.id?.trim();
  if (id) {
    throw new Error(
      'Bridge secrets only store Feishu/Lark App Secret entries. '
      + 'Use agent-runtime-services secrets set --id <id> for Runtime Services credentials.',
    );
  }
  const appId = opts.appId?.trim();
  if (appId) return { id: `app-${appId}`, label: `${appId} 的 App Secret` };
  throw new Error('用法: agent-interaction-bridge secrets set --app-id <id>');
}

export async function runSecretsSet(opts: SecretEntryCliOptions): Promise<void> {
  let entry: { id: string; label: string };
  try {
    entry = secretEntryForCli(opts);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const plaintext = await promptPassword(`输入 ${entry.label}: `);
  if (!plaintext) {
    console.error('✗ 取消(secret 为空)');
    process.exit(1);
  }
  await setSecret(entry.id, plaintext);
  console.log(`✓ 已加密存到当前 bridge 数据目录的 secrets.enc`);
}

export async function runSecretsList(): Promise<void> {
  const ids = await listSecretIds();
  if (ids.length === 0) {
    console.log('当前没有加密存储的 secret。');
    return;
  }
  console.log(`# 当前共 ${ids.length} 个 secret 在加密存储里\n`);
  for (const id of ids) {
    console.log(`  - ${id}`);
  }
}

export async function runSecretsRemove(opts: SecretEntryCliOptions): Promise<void> {
  let entry: { id: string; label: string };
  try {
    entry = secretEntryForCli(opts);
  } catch (err) {
    console.error((err as Error).message.replace('secrets set', 'secrets remove'));
    process.exit(1);
  }
  const removed = await removeSecret(entry.id);
  if (!removed) {
    console.error(`✗ 没找到 secret: ${entry.id}`);
    process.exit(1);
  }
  console.log(`✓ 已删除 ${entry.id}`);
}

// ────────────────────────────────────────────────────────────

async function readAllStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''; // no input piped
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Read a line from stdin without echoing it to the terminal. Mute the
 * output stream during input so the secret never appears on screen / in
 * scroll-back. Falls back to plain readline for non-TTY input.
 */
async function promptPassword(prompt: string): Promise<string> {
  const isTTY = Boolean(process.stdin.isTTY);
  return new Promise((resolve) => {
    const muted = new Writable({
      write(_chunk: Buffer | string, _enc, cb) {
        // Only suppress AFTER the prompt has been written. We let the
        // initial prompt through by writing it ourselves below, then
        // swallow everything else.
        cb();
      },
    });
    process.stdout.write(prompt);
    const rl = createInterface({
      input: process.stdin,
      output: isTTY ? muted : process.stdout,
      terminal: isTTY,
    });
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}
