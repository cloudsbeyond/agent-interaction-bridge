import type { ResourceRequirement, ResourcesListOutput } from '../../runtime-services/types';
import { createRuntimeServicesPortContext } from '../../runtime-services/selector';
import {
  formatRuntimeServiceFailure,
  reportRuntimeServicesCliError,
} from './runtime-services-errors';

export function formatResources(resources: ResourceRequirement[] = []): string {
  const lines = ['Bridge runtime services resources'];
  for (const resource of resources) {
    const status = resource.status === 'available'
      ? `available via ${resource.provider ?? 'operator'}`
      : 'stubbed';
    lines.push(
      [
        `- ${resource.id} [${resource.kind}] ${status}`,
        `  capability: ${resource.capability}`,
        `  action: ${resource.operatorAction}`,
      ].join('\n'),
    );
  }
  return lines.join('\n');
}

export async function runResourcesCli(): Promise<void> {
  try {
    const context = await createRuntimeServicesPortContext();
    const status = await context.runtime.call<Record<string, never>, ResourcesListOutput>(
      'resources.list',
      {},
      { consumer: 'domain-agent', purpose: 'resource listing' },
    );
    if (status.status !== 'ok') {
      process.exitCode = 1;
      console.log(formatRuntimeServiceFailure('Bridge runtime services resources', status));
      return;
    }
    console.log(formatResources(status.resources));
  } catch (error) {
    reportRuntimeServicesCliError(error);
  }
}
