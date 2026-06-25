import type { GatewayMode } from '../config/schema';

export const AGENT_SESSION_CONTEXT_VERSION = '2026-06-17.gateway-mode-contract-v1';

export function agentSessionContextVersion(gatewayMode: GatewayMode): string {
  return `${AGENT_SESSION_CONTEXT_VERSION}:${gatewayMode}`;
}
