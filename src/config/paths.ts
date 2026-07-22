import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'agent-interaction-bridge';
export const APP_HOME_ENV = 'AGENT_INTERACTION_BRIDGE_HOME';

export function resolveAppDirFromEnv(
  env: NodeJS.ProcessEnv,
  home: string,
  _exists: (path: string) => boolean = existsSync,
): string {
  const customHome = env[APP_HOME_ENV]?.trim();
  if (customHome) return customHome;

  return join(home, `.${APP_NAME}`);
}

const appDir = resolveAppDirFromEnv(process.env, homedir(), existsSync);

export const paths = {
  appDir,
  cacheDir: appDir,
  configFile: join(appDir, 'config.json'),
  sessionsFile: join(appDir, 'sessions.json'),
  proactiveCorrelationsFile: join(appDir, 'proactive-correlations.json'),
  workspacesFile: join(appDir, 'workspaces.json'),
  processesFile: join(appDir, 'processes.json'),
  healthDir: join(appDir, 'health'),
  secretsFile: join(appDir, 'secrets.enc'),
  keystoreSaltFile: join(appDir, '.keystore.salt'),
  /**
   * Thin shell wrapper that companion exec-provider consumers invoke to
   * resolve secrets from the bridge's encrypted store. Written user-owned and
   * non-symlinked so strict path audits can trust it on machines where `node`
   * is a Homebrew/Volta symlink or root-owned (`/usr/bin/node`). Wrapper
   * internals do the `node ... secrets get` invocation.
   */
  secretsGetterScript: join(appDir, 'secrets-getter'),
  mediaDir: join(appDir, 'media'),
};
