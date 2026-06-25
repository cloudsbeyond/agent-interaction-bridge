import { describe, expect, test } from 'vitest';
import {
  CLI_COMMAND_SPECS,
  cliCommandNames,
  findCliCommandSpec,
} from './registry';

describe('CLI command registry', () => {
  test('tracks top-level CLI commands and explicit stubs', () => {
    expect(cliCommandNames()).toEqual([
      'start',
      'ps',
      'stop',
      'secrets',
      'status',
      'resources',
      'models',
      'storage',
      'architecture',
      'doctor',
      'service',
    ]);
    expect(findCliCommandSpec('doctor')).toMatchObject({
      status: 'implemented',
      authority: 'local_operator',
    });
    expect(findCliCommandSpec('models')).toMatchObject({
      summary: expect.stringContaining('Runtime Services'),
    });
    expect(findCliCommandSpec('storage')).toMatchObject({
      status: 'implemented',
      summary: expect.stringContaining('Runtime Services'),
    });
    expect(CLI_COMMAND_SPECS.every((command) => command.summary)).toBe(true);
  });
});
