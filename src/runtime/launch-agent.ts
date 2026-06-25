import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { paths, APP_HOME_ENV } from '../config/paths';
import type { AgentEndpointKind } from '../config/schema';

export const LAUNCH_AGENT_LABEL = 'com.cloudsbeyond.agent-interaction-bridge';

export interface LaunchAgentPlistOptions {
  nodePath: string;
  cliPath: string;
  configPath: string;
  appHome: string;
  logPath: string;
  agentEndpoint: AgentEndpointKind;
}

export interface LaunchAgentInstallOptions {
  configPath?: string;
  appHome?: string;
  nodePath?: string;
  cliPath?: string;
  agentEndpoint?: AgentEndpointKind;
  userHome?: string;
}

export function launchAgentLabel(): string {
  return LAUNCH_AGENT_LABEL;
}

export function launchAgentPath(userHome = homedir()): string {
  return join(userHome, 'Library', 'LaunchAgents', `${launchAgentLabel()}.plist`);
}

export function defaultLaunchAgentLogPath(appHome = paths.appDir): string {
  return join(appHome, 'logs', 'launchd.log');
}

export function buildLaunchAgentPlist(options: LaunchAgentPlistOptions): string {
  const programArguments = [
    options.nodePath,
    options.cliPath,
    'start',
    '--config',
    options.configPath,
    '--agent-endpoint',
    options.agentEndpoint,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(launchAgentLabel())}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>${escapeXml(APP_HOME_ENV)}</key>
    <string>${escapeXml(options.appHome)}</string>
    <key>PATH</key>
    <string>${escapeXml(process.env.PATH ?? '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin')}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(options.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.logPath)}</string>
</dict>
</plist>
`;
}

export async function installLaunchAgent(options: LaunchAgentInstallOptions = {}): Promise<string> {
  const plistPath = launchAgentPath(options.userHome);
  const appHome = options.appHome ?? paths.appDir;
  const logPath = defaultLaunchAgentLogPath(appHome);
  const existingEndpoint = options.agentEndpoint ?? await readInstalledAgentEndpoint(plistPath);
  await mkdir(dirname(plistPath), { recursive: true });
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(
    plistPath,
    buildLaunchAgentPlist({
      nodePath: options.nodePath ?? process.execPath,
      cliPath: resolve(options.cliPath ?? process.argv[1] ?? join(process.cwd(), 'dist/cli.js')),
      configPath: resolve(options.configPath ?? paths.configFile),
      appHome,
      logPath,
      agentEndpoint: existingEndpoint ?? 'exec',
    }),
    'utf8',
  );
  return plistPath;
}

export async function uninstallLaunchAgent(options: LaunchAgentInstallOptions = {}): Promise<void> {
  await stopLaunchAgent(options).catch(() => undefined);
  await rm(launchAgentPath(options.userHome), { force: true });
}

export async function startLaunchAgent(options: LaunchAgentInstallOptions = {}): Promise<void> {
  const plistPath = launchAgentPath(options.userHome);
  if (!existsSync(plistPath)) {
    await installLaunchAgent(options);
  }
  await runLaunchctl(['bootstrap', launchGuiTarget(), plistPath], { allowFailure: true });
  await runLaunchctl(['kickstart', '-k', `${launchGuiTarget()}/${launchAgentLabel()}`]);
}

export async function stopLaunchAgent(options: LaunchAgentInstallOptions = {}): Promise<void> {
  await runLaunchctl(['bootout', launchGuiTarget(), launchAgentPath(options.userHome)], {
    allowFailure: true,
  });
}

export async function restartLaunchAgent(options: LaunchAgentInstallOptions = {}): Promise<void> {
  await stopLaunchAgent(options);
  await installLaunchAgent(options);
  await startLaunchAgent(options);
}

export async function statusLaunchAgent(): Promise<string> {
  const result = await runLaunchctl(['print', `${launchGuiTarget()}/${launchAgentLabel()}`], {
    allowFailure: true,
  });
  return result.exitCode === 0 ? result.stdout : `${launchAgentLabel()} is not loaded`;
}

function launchGuiTarget(): string {
  return `gui/${process.getuid?.() ?? 501}`;
}

async function readInstalledAgentEndpoint(
  plistPath: string,
): Promise<AgentEndpointKind | undefined> {
  try {
    const plist = await readFile(plistPath, 'utf8');
    const match = plist.match(
      /<string>--agent-endpoint<\/string>\s*<string>(exec|app-server)<\/string>/,
    );
    return match?.[1] as AgentEndpointKind | undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

function runLaunchctl(
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('launchctl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: code ?? 0,
      };
      if (result.exitCode !== 0 && !options.allowFailure) {
        reject(new Error(result.stderr || `launchctl exited ${result.exitCode}`));
        return;
      }
      resolvePromise(result);
    });
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
