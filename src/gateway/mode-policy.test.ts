import { describe, expect, test } from 'vitest';
import { resolveEffectiveGatewayMode } from './mode-policy';
import type { ResourceRequirement } from '../runtime-services/types';

describe('gateway mode policy', () => {
  test('keeps relay mode without requiring Runtime Services resources', () => {
    expect(resolveEffectiveGatewayMode({
      requestedMode: 'relay',
      resources: [],
    })).toEqual({
      requestedMode: 'relay',
      mode: 'relay',
      degraded: false,
    });
  });

  test('keeps adapter mode when adapter Runtime Services resources are available', () => {
    expect(resolveEffectiveGatewayMode({
      requestedMode: 'adapter',
      resources: [
        resource('model.language_completion', 'available'),
      ],
    })).toEqual({
      requestedMode: 'adapter',
      mode: 'adapter',
      degraded: false,
    });
  });

  test('degrades adapter mode to relay when Runtime Services adapter resources are missing', () => {
    const resolved = resolveEffectiveGatewayMode({
      requestedMode: 'adapter',
      resources: [
        resource('model.language_completion', 'stubbed'),
        resource('storage.artifact_store', 'available'),
      ],
    });

    expect(resolved.mode).toBe('relay');
    expect(resolved.degraded).toBe(true);
    expect(resolved.reason).toContain('Runtime Services');
  });
});

function resource(id: string, status: ResourceRequirement['status']): ResourceRequirement {
  return {
    id,
    kind: id.startsWith('storage.') ? 'storage' : 'model',
    capability: id,
    purpose: 'test',
    status,
    operatorAction: 'configure runtime services',
  };
}
