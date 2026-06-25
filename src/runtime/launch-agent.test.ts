import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildLaunchAgentPlist,
  installLaunchAgent,
  launchAgentLabel,
  launchAgentPath,
} from './launch-agent';

describe('launchd integration', () => {
  test('uses a stable user LaunchAgent label for the bridge', () => {
    expect(launchAgentLabel()).toBe('com.cloudsbeyond.agent-interaction-bridge');
  });

  test('builds a plist that starts the bridge with the selected endpoint', () => {
    const plist = buildLaunchAgentPlist({
      nodePath: '/opt/homebrew/bin/node',
      cliPath: '/repo/dist/cli.js',
      configPath: '/home/.agent-interaction-bridge/config.json',
      appHome: '/home/.agent-interaction-bridge',
      logPath: '/home/.agent-interaction-bridge/logs/launchd.log',
      agentEndpoint: 'app-server',
    });

    expect(plist).toContain('<key>ProgramArguments</key>');
    expect(plist).toContain('<string>/opt/homebrew/bin/node</string>');
    expect(plist).toContain('<string>/repo/dist/cli.js</string>');
    expect(plist).toContain('<string>--agent-endpoint</string>');
    expect(plist).toContain('<string>app-server</string>');
    expect(plist).toContain('<key>AGENT_INTERACTION_BRIDGE_HOME</key>');
    expect(plist).toContain('<string>/home/.agent-interaction-bridge</string>');
  });

  test('resolves the user LaunchAgents plist path', () => {
    const userHome = ['/Users', 'alice'].join('/');
    expect(launchAgentPath(userHome)).toBe(
      `${userHome}/Library/LaunchAgents/com.cloudsbeyond.agent-interaction-bridge.plist`,
    );
  });

  test('preserves the installed endpoint when reinstalling without an override', async () => {
    const userHome = await mkdtemp(join(tmpdir(), 'aib-launch-agent-'));
    try {
      await installLaunchAgent({
        userHome,
        nodePath: '/node',
        cliPath: '/repo/dist/cli.js',
        configPath: '/config.json',
        appHome: join(userHome, '.agent-interaction-bridge'),
        agentEndpoint: 'app-server',
      });
      await installLaunchAgent({
        userHome,
        nodePath: '/node',
        cliPath: '/repo/dist/cli.js',
        configPath: '/config.json',
        appHome: join(userHome, '.agent-interaction-bridge'),
      });

      const plist = await readFile(launchAgentPath(userHome), 'utf8');
      expect(plist).toContain('<string>app-server</string>');
    } finally {
      await rm(userHome, { recursive: true, force: true });
    }
  });
});
