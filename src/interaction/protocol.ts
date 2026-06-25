export type InteractionKind = 'risk_approval' | 'choice' | 'progress' | 'artifact_preview';
export type InteractionOption = 'approve' | 'modify' | 'reject' | 'patch_only' | string;

export interface InteractionRequest {
  id: string;
  kind: InteractionKind;
  title: string;
  summary: string;
  risk?: string;
  proposedAction?: string;
  options?: InteractionOption[];
}

const FENCED_JSON_RE = /```(?:json)?\s*([\s\S]*?)```/gi;
const AGENT_INTERACTION_RE = /"agent_interaction"\s*:/i;

export function extractInteractionRequests(text: string): InteractionRequest[] {
  const out: InteractionRequest[] = [];
  for (const match of text.matchAll(FENCED_JSON_RE)) {
    const body = match[1]?.trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body) as {
        agent_interaction?: unknown;
      };
      const req = normalizeInteraction(parsed.agent_interaction);
      if (req) out.push(req);
    } catch {
      continue;
    }
  }
  return out;
}

export function stripInteractionBlocks(text: string): string {
  if (!AGENT_INTERACTION_RE.test(text)) return text;
  return text
    .replace(FENCED_JSON_RE, (full, body: string) => {
      try {
        const parsed = JSON.parse(String(body).trim()) as {
          agent_interaction?: unknown;
        };
        const raw = parsed.agent_interaction;
        if (raw === undefined) return full;
        if (normalizeInteraction(raw)) return '';
        return fallbackInteractionText(raw);
      } catch {
        return full;
      }
    })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n/g, '\n')
    .trim();
}

function fallbackInteractionText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const obj = raw as Record<string, unknown>;
  const title = asString(obj.title);
  const summary = asString(obj.summary);
  if (title && summary) return `**${title}**\n${summary}`;
  return summary ?? title ?? '';
}

function normalizeInteraction(raw: unknown): InteractionRequest | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const id = asString(obj.id);
  const kind = asKind(obj.kind);
  const title = asString(obj.title);
  const summary = asString(obj.summary);
  if (!id || !kind || !title || !summary) return undefined;
  const options = Array.isArray(obj.options)
    ? obj.options.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined;
  return {
    id,
    kind,
    title,
    summary,
    risk: asString(obj.risk),
    proposedAction: asString(obj.proposedAction),
    options,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asKind(v: unknown): InteractionKind | undefined {
  return v === 'risk_approval' || v === 'choice' || v === 'progress' || v === 'artifact_preview'
    ? v
    : undefined;
}
