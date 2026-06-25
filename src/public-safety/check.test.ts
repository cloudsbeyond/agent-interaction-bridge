import { describe, expect, test } from 'vitest';

interface PublicSafetyIssue {
  path: string;
  ruleId: string;
  match: string;
}

interface PublicSafetyResult {
  ok: boolean;
  issues: PublicSafetyIssue[];
}

interface PublicSafetyModule {
  scanPublicSafetyFiles(
    files: Array<{ path: string; content: string }>,
    options?: { denylist?: Array<{ value: string; source?: string }> },
  ): PublicSafetyResult;
  formatPublicSafetyReport(result: PublicSafetyResult): string;
}

const {
  formatPublicSafetyReport,
  scanPublicSafetyFiles,
} = await import(new URL('../../tools/public-safety-check.mjs', import.meta.url).href) as PublicSafetyModule;

describe('public safety check', () => {
  test('flags real-looking Feishu/Lark ids while allowing synthetic fixtures', () => {
    const realOpenId = `ou_${'a'.repeat(32)}`;
    const realMessageId = `om_${'b'.repeat(24)}`;
    const realChatId = `oc_${'c'.repeat(24)}`;
    const realAppId = `cli_${'d'.repeat(16)}`;

    const result = scanPublicSafetyFiles([
      {
        path: 'src/example.test.ts',
        content: [
          `sender=${realOpenId}`,
          `message=${realMessageId}`,
          `chat=${realChatId}`,
          `app=${realAppId}`,
          'synthetic=ou_123 om_1 oc_123 cli_example_bot',
        ].join('\n'),
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.ruleId)).toEqual([
      'feishu.open_id',
      'feishu.message_id',
      'feishu.chat_id',
      'feishu.app_id',
    ]);
  });

  test('flags private local context markers outside allowed boundary files', () => {
    const privateLayer = ['.', 'alphaX'].join('');

    expect(
      scanPublicSafetyFiles([
        { path: 'README.md', content: `${privateLayer} local context` },
      ]).issues.map((issue) => issue.ruleId),
    ).toEqual(['private.local_context']);

    expect(
      scanPublicSafetyFiles([
        { path: '.gitignore', content: `${privateLayer}/\n` },
      ]).ok,
    ).toBe(true);
  });

  test('applies local private denylist literals without requiring them in git', () => {
    const privateName = 'Private Fixture Name';
    const result = scanPublicSafetyFiles(
      [{ path: 'src/example.test.ts', content: `hello ${privateName}` }],
      { denylist: [{ value: privateName, source: 'local-denylist' }] },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        ruleId: 'private.denylist',
        path: 'src/example.test.ts',
        match: privateName,
      }),
    ]);
  });

  test('flags common token and local path leaks', () => {
    const apiKey = `sk-${'x'.repeat(48)}`;
    const signedToken = `token=${'y'.repeat(24)}`;
    const localPath = `/Users/${'example'}/workspace/project`;
    const sessionId = `sessionId: ${'0'.repeat(8)}-${'1'.repeat(4)}-${'2'.repeat(4)}-${'3'.repeat(4)}-${'4'.repeat(12)}`;
    const result = scanPublicSafetyFiles([
      {
        path: 'src/example.test.ts',
        content: [apiKey, signedToken, localPath, sessionId].join('\n'),
      },
    ]);

    expect(result.issues.map((issue) => issue.ruleId)).toEqual([
      'secret.openai_api_key',
      'secret.url_token',
      'private.absolute_home_path',
      'private.codex_session_id',
    ]);
    expect(formatPublicSafetyReport(result)).toContain('Public safety check: FAIL');
  });
});
