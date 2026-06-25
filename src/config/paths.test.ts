import { describe, expect, test } from 'vitest';
import { resolveAppDirFromEnv } from './paths';

describe('resolveAppDirFromEnv', () => {
  const userHome = ['/Users', 'tester'].join('/');

  test('prefers the generic home environment variable', () => {
    expect(
      resolveAppDirFromEnv(
        {
          AGENT_INTERACTION_BRIDGE_HOME: '/tmp/new-home',
        },
        userHome,
      ),
    ).toBe('/tmp/new-home');
  });

  test('ignores non-generic home environment variables', () => {
    expect(
      resolveAppDirFromEnv(
        { SOME_OTHER_HOME: '/tmp/other-home' },
        userHome,
      ),
    ).toBe(`${userHome}/.agent-interaction-bridge`);
  });

  test('uses the generic default directory for fresh installs', () => {
    expect(
      resolveAppDirFromEnv({}, userHome, () => false),
    ).toBe(`${userHome}/.agent-interaction-bridge`);
  });

  test('exposes only clean-project path helpers', async () => {
    const pathModule = await import('./paths');
    expect(Object.keys(pathModule).sort()).toEqual([
      'APP_HOME_ENV',
      'APP_NAME',
      'paths',
      'resolveAppDirFromEnv',
    ]);
  });
});
