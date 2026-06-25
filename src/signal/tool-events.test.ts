import { describe, expect, test } from 'vitest';
import { extractToolResultSignals } from './tool-events';

describe('extractToolResultSignals', () => {
  test('turns successful test-like shell commands into test_report signals', () => {
    const signals = extractToolResultSignals({
      id: 'tool-1',
      name: 'shell',
      input: { command: 'pnpm test' },
      output: 'Test Files  14 passed (14)\nTests  42 passed (42)\n',
      isError: false,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'test_report',
      title: '测试通过',
      severity: 'info',
      summary: 'pnpm test',
      test: {
        command: 'pnpm test',
        passed: true,
      },
    });
  });

  test('turns failed build/typecheck commands into danger test_report signals', () => {
    const signals = extractToolResultSignals({
      id: 'tool-2',
      name: 'Bash',
      input: { command: 'pnpm typecheck' },
      output: 'src/index.ts(1,1): error TS1005\n',
      isError: true,
    });

    expect(signals[0]).toMatchObject({
      kind: 'test_report',
      title: '验证失败',
      severity: 'danger',
      summary: 'pnpm typecheck',
    });
  });

  test('turns git diff output into patch_preview signals with typed patch payload', () => {
    const signals = extractToolResultSignals({
      id: 'tool-3',
      name: 'shell',
      input: { command: 'git diff -- src' },
      output: [
        'diff --git a/src/a.ts b/src/a.ts',
        'index 111..222 100644',
        'diff --git a/src/b.ts b/src/b.ts',
        'index 333..444 100644',
      ].join('\n'),
      isError: false,
    });

    expect(signals[0]).toMatchObject({
      kind: 'patch_preview',
      title: 'Patch 预览',
      severity: 'info',
      summary: '检测到 2 个文件的 diff 输出',
      patch: {
        command: 'git diff -- src',
        fileCount: 2,
      },
    });
  });

  test('turns local rich artifact paths into artifact_preview signals', () => {
    const signals = extractToolResultSignals({
      id: 'tool-5',
      name: 'shell',
      input: { command: 'node scripts/render-report.js' },
      output: 'Report written to /tmp/codex/report.html\n',
      isError: false,
    });

    expect(signals[0]).toMatchObject({
      kind: 'artifact_preview',
      title: '产物预览',
      severity: 'info',
      artifact: {
        path: '/tmp/codex/report.html',
        representationHint: 'html',
        sourceToolId: 'tool-5',
      },
    });
  });

  test('ignores unrelated shell output', () => {
    const signals = extractToolResultSignals({
      id: 'tool-4',
      name: 'shell',
      input: { command: 'pwd' },
      output: '/tmp/project\n',
      isError: false,
    });

    expect(signals).toEqual([]);
  });
});
