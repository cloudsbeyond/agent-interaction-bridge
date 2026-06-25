import type { InteractionRequest } from '../interaction/protocol';
import { signalToInteractionRequest } from './interaction';
import type { AgentSignal, RepresentationStyle } from './router';

export type SignalPresentation =
  | { kind: 'interaction'; request: InteractionRequest }
  | { kind: 'markdown'; body: string };

export function canRenderSignalRepresentation(
  signal: AgentSignal,
  representation: RepresentationStyle,
): boolean {
  if (representation.id === 'interactive_card') {
    return signal.kind === 'risk_approval' || signal.kind === 'choice';
  }
  if (signal.kind === 'artifact_preview' && signal.artifact.representationHint) {
    if (['html', 'image', 'voice', 'file'].includes(representation.id)) {
      return signal.artifact.representationHint === representation.id;
    }
  }
  return true;
}

export function renderSignalPresentation(
  signal: AgentSignal,
  representation: RepresentationStyle,
): SignalPresentation {
  if (representation.id === 'interactive_card' && canRenderSignalRepresentation(signal, representation)) {
    const request = signalToInteractionRequest(signal);
    if (request) return { kind: 'interaction', request };
  }
  return { kind: 'markdown', body: renderMarkdownSignal(signal) };
}

export function renderMarkdownSignal(signal: AgentSignal): string {
  const lines = [`**${escapeMd(signal.title)}**`, escapeMd(signal.summary)];
  if (signal.kind === 'risk_approval' && signal.risk) {
    lines.push(`风险：${escapeMd(signal.risk)}`);
  }
  if (signal.kind === 'risk_approval' && signal.proposedAction) {
    lines.push(`拟执行：\n\`\`\`\n${escapeCodeBlock(signal.proposedAction)}\n\`\`\``);
  }
  if (signal.kind === 'artifact_preview') {
    lines.push(`产物：\`${escapeMd(signal.artifact.path)}\``);
  }
  return lines.filter(Boolean).join('\n\n');
}

function escapeMd(s: string): string {
  return s.replace(/([*_`\\])/g, '\\$1');
}

function escapeCodeBlock(s: string): string {
  return s.replace(/```/g, "'''");
}
