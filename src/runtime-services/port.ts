import type {
  RuntimeCapabilityId,
  RuntimeCapabilityIndex,
  RuntimeConsumer,
  RuntimeServiceEnvelope,
} from './types';

export interface RuntimeServicesPort {
  describe(): Promise<RuntimeCapabilityIndex>;

  call<TInput, TOutput extends object>(
    capabilityId: RuntimeCapabilityId,
    input: TInput,
    options?: {
      consumer: RuntimeConsumer;
      purpose?: string;
    },
  ): Promise<RuntimeServiceEnvelope<TOutput>>;
}
