import { describe, expect, test } from 'vitest';
import { secretEntryForCli } from './secrets';

describe('secrets cli helpers', () => {
  test('rejects generic runtime credential ids', () => {
    expect(() => secretEntryForCli({ id: 'RUNTIME_PROVIDER_API_KEY' })).toThrow('agent-runtime-services secrets');
  });

  test('keeps existing app secret id convention', () => {
    expect(secretEntryForCli({ appId: 'cli_123' })).toEqual({
      id: 'app-cli_123',
      label: 'cli_123 的 App Secret',
    });
  });

  test('requires an app id', () => {
    expect(() => secretEntryForCli({})).toThrow('--app-id <id>');
  });
});
