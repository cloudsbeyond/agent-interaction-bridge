import type { RuntimeServicesPort } from '../runtime-services/port';
import type {
  ResourceRequirement,
  RuntimeCapabilityId,
  RuntimeConsumer,
  RuntimeServiceEnvelope,
} from '../runtime-services/types';

export interface RuntimePortMockOptions {
  consumer?: RuntimeConsumer;
  purpose?: string;
}

export function runtimeResource(input: {
  id: string;
  status?: ResourceRequirement['status'];
  provider?: string;
  kind?: ResourceRequirement['kind'];
  capability?: string;
  purpose?: string;
  operatorAction?: string;
}): ResourceRequirement {
  return {
    id: input.id,
    kind: input.kind ?? (input.id.startsWith('model.') ? 'model' : input.id.startsWith('storage.') ? 'storage' : 'compute'),
    capability: input.capability ?? `${input.id} capability`,
    purpose: input.purpose ?? `${input.id} purpose`,
    status: input.status ?? 'stubbed',
    ...(input.provider ? { provider: input.provider } : {}),
    operatorAction: input.operatorAction ?? `configure ${input.id}`,
  };
}

export function runtimeResources(inputs: Parameters<typeof runtimeResource>[0][]): ResourceRequirement[] {
  return inputs.map(runtimeResource);
}

export function runtimePortMock(
  handlers: Partial<Record<RuntimeCapabilityId, (
    input: unknown,
    options?: RuntimePortMockOptions,
  ) => Promise<RuntimeServiceEnvelope<object>> | RuntimeServiceEnvelope<object>>>,
): RuntimeServicesPort {
  return {
    describe: async () => ({
      schemaVersion: 1,
      capabilities: Object.keys(handlers).map((id) => ({ id })),
    }),
    call: async <TInput, TOutput extends object>(
      _capabilityId: RuntimeCapabilityId,
      input: TInput,
      options?: RuntimePortMockOptions,
    ) => {
      const handler = handlers[_capabilityId];
      if (!handler) {
        return {
          status: 'failed',
          capabilityId: _capabilityId,
          providerId: 'mock-runtime-port',
          modelId: 'not-applicable',
          evidence: [{ kind: 'missing_mock_handler' }],
        } as RuntimeServiceEnvelope<TOutput>;
      }
      return await handler(input, options) as RuntimeServiceEnvelope<TOutput>;
    },
  };
}
