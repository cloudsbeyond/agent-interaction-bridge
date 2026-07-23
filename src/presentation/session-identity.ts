export interface InteractionSessionIdentity {
  /** Bridge-owned conversation scope (chat id or topic scope). */
  bridge: string;
  /** Current Domain Agent session/thread reference, when one exists. */
  domain?: string;
  /** Current or most recent task runtime, when the reply has task context. */
  elapsedMs?: number;
}

const DEFAULT_SESSION_IDENTIFIER_LENGTH = 8;
const SESSION_IDENTITY_LINE_RE = /^(?:[-*]\s+)?(?:>\s*)?(?:Session：(?:Bridge|🌉|📥)\s*-\s*\S+\s*\|\s*(?:Domain|🤖)\s*-\s*\S+|Bridge Session:\s*\S+\s*\|\s*Domain Session:\s*\S+)(?:\s*\|\s*(?:耗时|⏱️|⏳)\s*-\s*(?:\d+m\s+)?\d+s)?$/u;

export function compactBridgeSessionIdentifier(
  value: string | undefined,
  maxLength = DEFAULT_SESSION_IDENTIFIER_LENGTH,
): string {
  const normalized = value?.trim() || '-';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(-maxLength);
}

export function compactDomainSessionIdentifier(
  value: string | undefined,
  maxLength = DEFAULT_SESSION_IDENTIFIER_LENGTH,
): string {
  const normalized = value?.trim() || '-';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength);
}

export function formatSessionElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '0s';
  const seconds = Math.floor(elapsedMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function renderSessionIdentityMarkdown(identity: InteractionSessionIdentity): string {
  return `> ${renderSessionIdentityPlainText(identity)}`;
}

export function renderSessionIdentityPlainText(identity: InteractionSessionIdentity): string {
  const elapsed = identity.elapsedMs === undefined
    ? ''
    : ` | ⏳ - ${formatSessionElapsed(identity.elapsedMs)}`;
  return `Session：📥 - ${compactBridgeSessionIdentifier(identity.bridge)} | 🤖 - ${compactDomainSessionIdentifier(identity.domain)}${elapsed}`;
}

export function isSessionIdentityLine(value: unknown): value is string {
  return typeof value === 'string' && SESSION_IDENTITY_LINE_RE.test(value.trim());
}

export function stripTrailingSessionIdentity(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;

  while (end > 0) {
    while (end > 0 && !lines[end - 1]?.trim()) end -= 1;
    if (end === 0 || !isSessionIdentityLine(lines[end - 1])) break;
    end -= 1;
  }

  return lines.slice(0, end).join('\n').trimEnd();
}

export function appendSessionIdentityMarkdown(
  body: string,
  identity: InteractionSessionIdentity,
): string {
  const content = stripTrailingSessionIdentity(body);
  const footer = renderSessionIdentityMarkdown(identity);
  return content ? `${content}\n\n${footer}` : footer;
}

export function appendSessionIdentityPlainText(
  body: string,
  identity: InteractionSessionIdentity,
): string {
  const content = stripTrailingSessionIdentity(body);
  const footer = renderSessionIdentityPlainText(identity);
  return content ? `${content}\n\n${footer}` : footer;
}
