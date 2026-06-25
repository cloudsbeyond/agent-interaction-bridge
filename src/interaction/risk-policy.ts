import { createHash } from 'node:crypto';
import type { InteractionRequest } from './protocol';

interface Rule {
  risk: string;
  pattern: RegExp;
}

const SHELL_RULES: Rule[] = [
  { risk: 'destructive filesystem change', pattern: /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b|\brm\s+-rf\b/i },
  { risk: 'remote git write', pattern: /\bgit\s+push\b|\bgit\s+tag\b.*\b-f\b/i },
  { risk: 'package publish', pattern: /\b(?:npm|pnpm|yarn)\s+publish\b/i },
  { risk: 'infrastructure mutation', pattern: /\b(?:kubectl|terraform|pulumi|serverless|vercel|netlify|flyctl)\s+(?:apply|destroy|deploy|up|release|set|delete)\b/i },
  { risk: 'permission or ownership mutation', pattern: /\b(?:chmod|chown)\s+-R\b/i },
];

export function assessToolRisk(name: string, input: unknown): InteractionRequest | undefined {
  if (name !== 'shell' && name !== 'Bash') return undefined;
  const command = commandFromInput(input);
  if (!command) return undefined;
  const rule = SHELL_RULES.find((r) => r.pattern.test(command));
  if (!rule) return undefined;
  return {
    id: `shell-${riskSignature(name, input).slice(0, 10)}`,
    kind: 'risk_approval',
    title: '需要人工确认风险操作',
    summary: 'Codex 准备执行一个可能影响本机、远端仓库或外部环境的命令。',
    risk: rule.risk,
    proposedAction: command,
    options: ['approve', 'modify', 'reject', 'patch_only'],
  };
}

export function riskSignature(name: string, input: unknown): string {
  const normalized = `${name}:${commandFromInput(input) ?? JSON.stringify(input) ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex');
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const command = (input as { command?: unknown }).command;
  return typeof command === 'string' && command.trim() ? command.trim() : undefined;
}
