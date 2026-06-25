import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  RUNTIME_DATA_ENTRIES,
  runtimeDataGitIgnorePatterns,
  validateRuntimeDataGitIgnore,
} from './data-contract';

describe('runtime data contract', () => {
  test('lists local runtime files and directories that must stay out of git', () => {
    expect(RUNTIME_DATA_ENTRIES.map((entry) => entry.path)).toEqual([
      '.agent-interaction-bridge/',
      'bridge-data/',
      'config.json',
      'model-providers.json',
      'secrets.enc',
      'sessions.json',
      'workspaces.json',
      'processes.json',
      'media/',
      'artifacts/',
      'db/',
      'vector/',
      'logs/',
      'debug-*.md',
    ]);
    expect(RUNTIME_DATA_ENTRIES.every((entry) => entry.committable === false)).toBe(true);
  });

  test('validates repository gitignore coverage for runtime data entries', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(validateRuntimeDataGitIgnore(gitignore)).toEqual([]);
    expect(runtimeDataGitIgnorePatterns()).toContain('model-providers.json');
    expect(runtimeDataGitIgnorePatterns()).toContain('secrets.enc');
  });
});
