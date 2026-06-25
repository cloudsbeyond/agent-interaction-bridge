import type { InteractionKind, InteractionRequest } from '../interaction/protocol';
import type { AgentSignal } from './router';

const INTERACTION_KINDS = new Set<InteractionKind>([
  'risk_approval',
  'choice',
  'progress',
  'artifact_preview',
]);

export function interactionRequestToSignal(request: InteractionRequest): AgentSignal {
  switch (request.kind) {
    case 'risk_approval':
      return {
        id: request.id,
        kind: 'risk_approval',
        title: request.title,
        summary: request.summary,
        severity: 'danger',
        risk: request.risk,
        proposedAction: request.proposedAction,
        actions: request.options,
      };
    case 'choice':
      return {
        id: request.id,
        kind: 'choice',
        title: request.title,
        summary: request.summary,
        severity: 'info',
        actions: request.options,
      };
    case 'artifact_preview':
      return {
        id: request.id,
        kind: 'artifact_preview',
        title: request.title,
        summary: request.summary,
        severity: 'info',
        artifact: { path: request.proposedAction ?? request.summary },
      };
    case 'progress':
      return {
        id: request.id,
        kind: 'progress',
        title: request.title,
        summary: request.summary,
        severity: 'info',
      };
  }
}

export function signalToInteractionRequest(signal: AgentSignal): InteractionRequest | undefined {
  if (!signal.id || !isInteractionKind(signal.kind)) return undefined;
  switch (signal.kind) {
    case 'risk_approval':
      return {
        id: signal.id,
        kind: signal.kind,
        title: signal.title,
        summary: signal.summary,
        risk: signal.risk,
        proposedAction: signal.proposedAction,
        options: signal.actions,
      };
    case 'choice':
      return {
        id: signal.id,
        kind: signal.kind,
        title: signal.title,
        summary: signal.summary,
        options: signal.actions,
      };
    case 'artifact_preview':
      return {
        id: signal.id,
        kind: signal.kind,
        title: signal.title,
        summary: signal.summary,
        proposedAction: signal.artifact.path,
      };
    case 'progress':
      return {
        id: signal.id,
        kind: signal.kind,
        title: signal.title,
        summary: signal.summary,
      };
  }
}

function isInteractionKind(kind: AgentSignal['kind']): kind is InteractionKind {
  return INTERACTION_KINDS.has(kind as InteractionKind);
}
