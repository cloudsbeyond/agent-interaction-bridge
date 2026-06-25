import type { GatewayMode } from '../config/schema';
import type { ResourceRequirement } from '../runtime-services/types';
import {
  hasAvailableRuntimeResource,
  RUNTIME_RESOURCE_IDS,
} from '../runtime-services/resources';

export interface EffectiveGatewayMode {
  requestedMode: GatewayMode;
  mode: GatewayMode;
  degraded: boolean;
  reason?: string;
}

export function resolveEffectiveGatewayMode(input: {
  requestedMode: GatewayMode;
  resources: ResourceRequirement[];
}): EffectiveGatewayMode {
  if (input.requestedMode === 'relay') {
    return {
      requestedMode: input.requestedMode,
      mode: 'relay',
      degraded: false,
    };
  }

  if (hasAdapterRuntimeResource(input.resources)) {
    return {
      requestedMode: input.requestedMode,
      mode: 'adapter',
      degraded: false,
    };
  }

  return {
    requestedMode: input.requestedMode,
    mode: 'relay',
    degraded: true,
    reason: 'Runtime Services adapter resources are unavailable',
  };
}

export function hasAdapterRuntimeResource(resources: ResourceRequirement[]): boolean {
  return hasAvailableRuntimeResource(resources, RUNTIME_RESOURCE_IDS.languageCompletion);
}
