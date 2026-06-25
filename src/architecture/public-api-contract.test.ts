import { describe, expect, test } from 'vitest';
import {
  extractPublicExportSources,
  validatePublicApiContract,
} from './public-api-contract';

describe('public API contract', () => {
  test('extracts public export sources from index barrel exports', () => {
    const sources = extractPublicExportSources([
      "export { renderText } from './card/text-renderer';",
      "export type { RunState } from './card/run-state';",
      "export { CodexAdapter, createAgentAdapter } from './agent';",
      "const local = true;",
    ].join('\n'));

    expect(sources).toEqual([
      './agent',
      './card/run-state',
      './card/text-renderer',
    ]);
  });

  test('rejects public exports that are not listed in the L2 contract', () => {
    const result = validatePublicApiContract({
      indexSource: [
        "export { renderText } from './card/text-renderer';",
        "export { secretAdapter } from './provider/internal';",
      ].join('\n'),
      allowedSources: ['./card/text-renderer'],
    });

    expect(result.ok).toBe(false);
    expect(result.extraSources).toEqual(['./provider/internal']);
    expect(result.failures).toContain('public_api.extra_exports');
  });

  test('accepts the repository public API export contract', () => {
    expect(validatePublicApiContract().ok).toBe(true);
  });
});
