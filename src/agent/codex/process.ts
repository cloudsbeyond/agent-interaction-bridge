import { spawn } from 'node:child_process';
import type { AgentRunOptions } from '../types';

const MACOS_CODEX_APP_BINARY = '/Applications/Codex.app/Contents/Resources/codex';
const MACOS_CHATGPT_APP_BINARY = '/Applications/ChatGPT.app/Contents/Resources/codex';

export function codexBinaryCandidates(binary?: string): string[] {
  return [binary ?? 'codex', MACOS_CODEX_APP_BINARY, MACOS_CHATGPT_APP_BINARY].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

export async function findCodexBinary(binary?: string): Promise<string | undefined> {
  for (const candidate of codexBinaryCandidates(binary)) {
    if (await canRunCodex(candidate)) return candidate;
  }
  return undefined;
}

export function buildCodexEnv(
  opts: Partial<AgentRunOptions>,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    AGENT_INTERACTION_BRIDGE: '1',
    ...(opts.codexHome ? { CODEX_HOME: opts.codexHome } : {}),
  };
}

function canRunCodex(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}
