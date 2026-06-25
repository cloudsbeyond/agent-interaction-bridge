import type { RuntimeServiceEnvelope } from '../../runtime-services/types';

export class RuntimeServicesCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeServicesCliError';
  }
}

export function formatRuntimeServicesUnavailable(error: unknown): string {
  return [
    'Runtime Services unavailable',
    `reason: ${errorMessage(error)}`,
  ].join('\n');
}

export function formatRuntimeServiceFailure(
  title: string,
  envelope: Pick<RuntimeServiceEnvelope, 'status' | 'capabilityId' | 'providerId' | 'evidence'>,
): string {
  return [
    title,
    `status: ${envelope.status}`,
    `capability: ${envelope.capabilityId}`,
    `provider: ${envelope.providerId}`,
    `reason: ${evidenceMessage(envelope)}`,
  ].join('\n');
}

export function throwRuntimeServiceFailure(
  title: string,
  envelope: Pick<RuntimeServiceEnvelope, 'status' | 'capabilityId' | 'providerId' | 'evidence'>,
): never {
  throw new RuntimeServicesCliError(formatRuntimeServiceFailure(title, envelope));
}

export function reportRuntimeServicesCliError(error: unknown): void {
  const message = error instanceof RuntimeServicesCliError
    ? error.message
    : formatRuntimeServicesUnavailable(error);
  console.error(message);
  process.exitCode = 1;
}

function evidenceMessage(
  envelope: Pick<RuntimeServiceEnvelope, 'status' | 'evidence'>,
): string {
  return envelope.evidence.find((item) => item.message)?.message
    ?? envelope.evidence[0]?.kind
    ?? envelope.status;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}
