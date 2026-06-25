import type {
  RuntimeCapabilityId,
  RuntimeConsumer,
  RuntimeServiceEnvelope,
  RuntimeServicesTransport,
} from './types';

export interface RuntimePolicyInput {
  transport: RuntimeServicesTransport;
  capabilityId: RuntimeCapabilityId;
  consumer: RuntimeConsumer;
  purpose?: string;
  mcpAllowlist?: ReadonlySet<RuntimeCapabilityId>;
}

export interface RuntimePolicyDecision {
  allowed: boolean;
  reason?: string;
}

const SECRET_OR_ADMIN_CAPABILITY = /^(secrets?|admin)\./i;

export function decideRuntimeCapabilityAccess(input: RuntimePolicyInput): RuntimePolicyDecision {
  if (SECRET_OR_ADMIN_CAPABILITY.test(input.capabilityId)) {
    return {
      allowed: false,
      reason: `${input.capabilityId} is not exposed through RuntimeServicesPort`,
    };
  }

  if (input.transport === 'mcp' && input.mcpAllowlist && !input.mcpAllowlist.has(input.capabilityId)) {
    return {
      allowed: false,
      reason: `${input.capabilityId} is not allowlisted by the caller for remote MCP transport`,
    };
  }
  return { allowed: true };
}

export function deniedRuntimeServiceEnvelope<TOutput extends object>(
  capabilityId: RuntimeCapabilityId,
  reason: string,
): RuntimeServiceEnvelope<TOutput> {
  return {
    status: 'failed',
    capabilityId,
    providerId: 'runtime-services-policy',
    modelId: 'not-applicable',
    evidence: [{ kind: 'policy_denied', message: reason }],
  } as RuntimeServiceEnvelope<TOutput>;
}

export function failedRuntimeServiceEnvelope<TOutput extends object>(
  capabilityId: RuntimeCapabilityId,
  providerId: string,
  message: string,
): RuntimeServiceEnvelope<TOutput> {
  return {
    status: 'failed',
    capabilityId,
    providerId,
    modelId: 'not-applicable',
    evidence: [{ kind: 'transport_error', message }],
  } as RuntimeServiceEnvelope<TOutput>;
}
