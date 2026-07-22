import { describe, expect, test } from 'vitest';
import { AGENT_RUNTIME_CODEX_CLI } from '../../topology/entities';
import { buildCodexArgs, buildCodexEnv, CodexAdapter, codexBinaryCandidates, formatCodexExitError } from './adapter';

describe('CodexAdapter identity', () => {
  test('uses the generic agent runtime entity id', () => {
    const adapter = new CodexAdapter();

    expect(adapter.id).toBe(AGENT_RUNTIME_CODEX_CLI.id);
    expect(adapter.displayName).toBe(AGENT_RUNTIME_CODEX_CLI.displayName);
  });
});

describe('buildCodexArgs', () => {
  const sessionId = ['019e488d', '4cb9', '7f21', 'abe7', '7b3320ee280a'].join('-');

  test('builds args for a fresh non-interactive Codex run', () => {
    expect(
      buildCodexArgs({
        prompt: 'hello',
        cwd: '/tmp/project',
      }),
    ).toEqual([
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'danger-full-access',
      '--dangerously-bypass-approvals-and-sandbox',
      '-C',
      '/tmp/project',
      '-',
    ]);
  });

  test('builds bounded args when profile policy disables permission bypass', () => {
    expect(
      buildCodexArgs({
        prompt: 'hello',
        cwd: '/tmp/guest-workspace',
        permissionMode: 'default',
        sandboxMode: 'workspace-write',
      }),
    ).toEqual([
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      '-C',
      '/tmp/guest-workspace',
      '-',
    ]);
  });

  test('builds args for resuming an existing agent runtime thread', () => {
    expect(
      buildCodexArgs({
        prompt: 'continue',
        sessionId,
        model: 'gpt-5.4',
      }),
    ).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '-m',
      'gpt-5.4',
      sessionId,
      '-',
    ]);
  });

  test('resumes without dangerous bypass when profile policy provides bounded permissions', () => {
    expect(
      buildCodexArgs({
        prompt: 'continue',
        sessionId,
        permissionMode: 'default',
      }),
    ).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      sessionId,
      '-',
    ]);
  });
});

describe('buildCodexEnv', () => {
  test('adds bridge marker and scoped Codex home without model-provider secret injection', () => {
    expect(
      buildCodexEnv(
        {
          prompt: 'hello',
          codexHome: '/tmp/codex-home',
        },
        { PATH: '/bin' },
      ),
    ).toMatchObject({
      PATH: '/bin',
      AGENT_INTERACTION_BRIDGE: '1',
      CODEX_HOME: '/tmp/codex-home',
    });
    expect(buildCodexEnv({ prompt: 'hello' }, {})).not.toHaveProperty('MODEL_PROVIDER_API_KEY');
  });
});

describe('codexBinaryCandidates', () => {
  test('prefers explicit binary and includes the macOS app fallback', () => {
    expect(codexBinaryCandidates('/tmp/codex')).toEqual([
      '/tmp/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex',
    ]);
  });

  test('checks PATH command before the macOS app fallback by default', () => {
    expect(codexBinaryCandidates()).toEqual([
      'codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex',
    ]);
  });
});

describe('formatCodexExitError', () => {
  test('turns invalidated auth output into a re-login instruction', () => {
    const msg = formatCodexExitError(
      1,
      'Your authentication token has been invalidated. Please try signing in again.',
    );
    expect(msg).toContain('Codex 登录已失效');
    expect(msg).toContain('`codex logout`');
    expect(msg).toContain('`codex login`');
  });

  test('uses the resolved Codex app binary in re-login instructions', () => {
    const msg = formatCodexExitError(
      1,
      'token_invalidated',
      '/Applications/Codex.app/Contents/Resources/codex',
    );
    expect(msg).toContain('`/Applications/Codex.app/Contents/Resources/codex logout`');
    expect(msg).toContain('`/Applications/Codex.app/Contents/Resources/codex login`');
  });

  test('explains 401 from upstream', () => {
    const msg = formatCodexExitError(1, 'HTTP error: 401 Unauthorized');
    expect(msg).toContain('401/403');
    expect(msg).toContain('`codex logout`');
  });

  test('explains rate limit', () => {
    const msg = formatCodexExitError(1, 'rate limit reached');
    expect(msg).toContain('限流');
  });

  test('explains network errors', () => {
    const msg = formatCodexExitError(1, 'getaddrinfo ENOTFOUND chatgpt.com');
    expect(msg).toContain('网络');
  });

  test('keeps generic exit failures with trimmed stderr details', () => {
    expect(formatCodexExitError(2, 'plain failure')).toBe(
      '⚠️ Codex 进程异常退出（exit 2）: plain failure',
    );
  });
});
