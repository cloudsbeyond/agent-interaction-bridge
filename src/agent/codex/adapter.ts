import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { log } from '../../core/logger';
import { AGENT_RUNTIME_CODEX_CLI } from '../../topology/entities';
import type { AgentAdapter, AgentEvent, AgentRun, AgentRunOptions } from '../types';
import { CodexAppServerSessionCatalog } from './app-server-sessions';
import { buildCodexEnv, codexBinaryCandidates, findCodexBinary } from './process';
import { translateEvent } from './stream-json';

export { buildCodexEnv, codexBinaryCandidates } from './process';

export interface CodexAdapterOptions {
  binary?: string;
}

type CodexChild = ChildProcessByStdio<Writable, Readable, Readable>;

export function formatCodexExitError(exitCode: number, stderr: string, binary = 'codex'): string {
  const text = stderr || '';

  // 1) 登录态失效（access token 被作废 / refresh token reuse 检测命中）
  if (
    /token_invalidated|refresh_token_reused|authentication token has been invalidated|Please try signing in again|log out and sign in again/i.test(
      text,
    )
  ) {
    return [
      '⚠️ Codex 登录已失效，需要你手动重新登录后再用：',
      '',
      `1. 在这台 Mac 上执行：\`${binary} logout\``,
      `2. 再执行：\`${binary} login\` 完成浏览器授权`,
      '3. 回到飞书重新发消息即可（bridge 不需要重启）',
      '',
      '常见原因：同一 ChatGPT 账号在多设备/多份 codex 上同时使用，触发了 OAuth 复用检测。',
    ].join('\n');
  }

  // 2) 上游 401 / 403：鉴权或额度问题
  if (/\b401\b|Unauthorized|\b403\b|Forbidden/i.test(text)) {
    return [
      '⚠️ Codex 调用 ChatGPT 接口被拒（401/403）。',
      '',
      `请先确认账号状态，再执行：\`${binary} logout\` → \`${binary} login\` 重登一次。`,
      '若仍失败，可能是订阅 / 额度 / 风控相关，需要去 ChatGPT 网页确认账号状态。',
    ].join('\n');
  }

  // 3) 限流
  if (/\b429\b|rate.?limit|too many requests/i.test(text)) {
    return '⚠️ Codex 触发了上游限流（429）。请稍后再发一次；如果频繁出现，请减少并发或更换更稳定的网络。';
  }

  // 4) 网络 / 代理 / DNS / 证书
  if (
    /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|getaddrinfo|tls|certificate|self-signed|proxy/i.test(
      text,
    )
  ) {
    return [
      '⚠️ Codex 无法连接到上游服务（疑似网络 / 代理 / DNS / 证书问题）。',
      '',
      '请检查：',
      '- 当前网络能否访问 chatgpt.com / api.openai.com',
      '- 是否开启了代理但代理本身有问题',
      '- 系统时间是否正确（证书校验依赖系统时间）',
      '修好网络后直接重发飞书消息即可，bridge 不需要重启。',
    ].join('\n');
  }

  // 5) 找不到 codex 可执行文件
  if (/ENOENT|command not found|No such file or directory/i.test(text)) {
    return [
      '⚠️ 没找到 Codex 可执行文件。',
      '',
      '请确认 Codex 已经安装，并且 `codex --version` 能正常输出。',
      '推荐使用 `/Applications/Codex.app/Contents/Resources/codex` 这一份。',
    ].join('\n');
  }

  // 6) 兜底：保留原始 stderr 摘要，并明确这是 Codex 自己退出的，bridge 没崩
  const detail = text ? `: ${text.trim().slice(0, 500)}` : '';
  return `⚠️ Codex 进程异常退出（exit ${exitCode}）${detail}`;
}

export function buildCodexArgs(opts: AgentRunOptions): string[] {
  const common = ['--json', '--skip-git-repo-check'];
  const bypassPermissions = opts.permissionMode === undefined || opts.permissionMode === 'bypassPermissions';

  if (opts.sessionId) {
    const args = [
      'exec',
      'resume',
      ...common,
    ];
    if (bypassPermissions) args.push('--dangerously-bypass-approvals-and-sandbox');
    if (opts.model) args.push('-m', opts.model);
    args.push(opts.sessionId, '-');
    return args;
  }

  const args = [
    'exec',
    ...common,
    '--sandbox',
    opts.sandboxMode ?? 'danger-full-access',
  ];
  if (bypassPermissions) args.push('--dangerously-bypass-approvals-and-sandbox');
  if (opts.cwd) args.push('-C', opts.cwd);
  if (opts.model) args.push('-m', opts.model);
  args.push('-');
  return args;
}

export class CodexAdapter implements AgentAdapter {
  readonly id = AGENT_RUNTIME_CODEX_CLI.id;
  readonly displayName = AGENT_RUNTIME_CODEX_CLI.displayName;
  readonly sessions: CodexAppServerSessionCatalog;

  private readonly binary: string;
  private resolvedBinary?: string;

  constructor(opts: CodexAdapterOptions = {}) {
    this.binary = opts.binary ?? 'codex';
    this.sessions = new CodexAppServerSessionCatalog({ binary: this.binary });
  }

  async isAvailable(): Promise<boolean> {
    this.resolvedBinary = await findCodexBinary(this.binary);
    return this.resolvedBinary !== undefined;
  }

  private async getBinary(): Promise<string> {
    if (this.resolvedBinary) return this.resolvedBinary;
    if (!(await this.isAvailable())) return this.binary;
    return this.resolvedBinary ?? this.binary;
  }

  async runAsync(opts: AgentRunOptions): Promise<AgentRun> {
    const binary = await this.getBinary();
    return this.runWithBinary(binary, opts);
  }

  run(opts: AgentRunOptions): AgentRun {
    return this.runWithBinary(this.resolvedBinary ?? this.binary, opts);
  }

  private runWithBinary(binary: string, opts: AgentRunOptions): AgentRun {
    const args = buildCodexArgs(opts);
    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env: buildCodexEnv(opts),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end(opts.prompt);

    log.info('agent', 'spawn', {
      pid: child.pid ?? null,
      cwd: opts.cwd ?? process.cwd(),
      hasSession: Boolean(opts.sessionId),
      promptChars: opts.prompt.length,
      model: opts.model,
      agent: this.id,
      endpointProfileId: opts.endpointProfileId,
      binary,
    });

    const stderrChunks: Buffer[] = [];
    let stderrBuffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBuffer += chunk.toString('utf8');
      let nl = stderrBuffer.indexOf('\n');
      while (nl !== -1) {
        const line = stderrBuffer.slice(0, nl);
        stderrBuffer = stderrBuffer.slice(nl + 1);
        if (line.trim()) log.warn('agent', 'stderr', { line });
        nl = stderrBuffer.indexOf('\n');
      }
    });

    let runtimeError: Error | null = null;
    child.on('error', (err) => {
      runtimeError = err;
    });
    child.on('exit', (code, signal) => {
      log.info('agent', 'exit', { pid: child.pid ?? null, code, signal, agent: this.id });
    });

    const stopGraceMs = opts.stopGraceMs ?? 5000;

    return {
      pid: child.pid,
      events: createEventStream(child, stderrChunks, () => runtimeError, binary),
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        log.info('agent', 'stop-sigterm', { pid: child.pid ?? null, graceMs: stopGraceMs });
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              log.warn('agent', 'stop-sigkill', {
                pid: child.pid ?? null,
                graceMs: stopGraceMs,
                reason: 'grace-period-expired',
              });
              child.kill('SIGKILL');
            }
            resolve();
          }, stopGraceMs);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      },
      waitForExit(timeoutMs: number): Promise<boolean> {
        if (child.exitCode !== null || child.signalCode !== null) {
          return Promise.resolve(true);
        }
        return new Promise<boolean>((resolve) => {
          const onExit = (): void => {
            clearTimeout(timer);
            resolve(true);
          };
          const timer = setTimeout(() => {
            child.removeListener('exit', onExit);
            resolve(false);
          }, timeoutMs);
          child.once('exit', onExit);
        });
      },
    };
  }
}


async function* createEventStream(
  child: CodexChild,
  stderrChunks: Buffer[],
  getError: () => Error | null,
  binary: string,
): AsyncGenerator<AgentEvent> {
  if (!child.pid) {
    const err = getError();
    yield {
      type: 'error',
      message: err ? `failed to spawn codex: ${err.message}` : 'spawn returned no pid',
    };
    return;
  }

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      yield* translateEvent(parsed);
    }
  } finally {
    rl.close();
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
    } else {
      child.once('exit', (code) => resolve(code));
    }
  });

  const runtimeError = getError();
  if (exitCode !== 0 && exitCode !== null) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    yield { type: 'error', message: formatCodexExitError(exitCode, stderr, binary) };
  } else if (runtimeError) {
    yield { type: 'error', message: `codex runtime error: ${runtimeError.message}` };
  }
}
