import { describe, expect, test } from 'vitest';
import { interactionRequestToSignal, signalToInteractionRequest } from './interaction';

describe('interaction signal conversion', () => {
  test('preserves HITL request fields as a semantic AgentSignal', () => {
    const signal = interactionRequestToSignal({
      id: 'risk-deploy',
      kind: 'risk_approval',
      title: 'Deploy service?',
      summary: 'Codex wants to deploy the current workspace.',
      risk: 'external side effect',
      proposedAction: 'pnpm deploy',
      options: ['approve', 'patch_only', 'reject'],
    });

    expect(signal).toMatchObject({
      id: 'risk-deploy',
      kind: 'risk_approval',
      title: 'Deploy service?',
      summary: 'Codex wants to deploy the current workspace.',
      severity: 'danger',
      risk: 'external side effect',
      proposedAction: 'pnpm deploy',
      actions: ['approve', 'patch_only', 'reject'],
    });
  });

  test('round-trips interaction-capable signals back to card requests', () => {
    const request = signalToInteractionRequest({
      id: 'choose-plan',
      kind: 'choice',
      title: 'Pick an approach',
      summary: 'Choose how Codex should continue.',
      actions: ['方案 A', '方案 B'],
    });

    expect(request).toEqual({
      id: 'choose-plan',
      kind: 'choice',
      title: 'Pick an approach',
      summary: 'Choose how Codex should continue.',
      options: ['方案 A', '方案 B'],
    });
  });
});
