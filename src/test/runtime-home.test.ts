import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { paths } from '../config/paths';

describe('test runtime home isolation', () => {
  test('runs the canonical test command outside the operator runtime home', () => {
    expect(paths.appDir).toBe(process.env.AGENT_INTERACTION_BRIDGE_HOME);
    expect(paths.appDir.startsWith(tmpdir())).toBe(true);
    expect(paths.appDir).not.toBe(join(homedir(), '.agent-interaction-bridge'));
  });
});
