import type { ResourceRequirement, ResourcesListOutput } from '../../runtime-services/types';
import {
  findRuntimeResource,
  futureResourceIds,
  localRequiredResourceIds,
  missingRuntimeResource,
  resourceAvailable,
} from '../../runtime-services/resources';
import { createRuntimeServicesPortContext } from '../../runtime-services/selector';
import { collectStatus, isConnectedHealth, type CliStatus } from './status';
import {
  formatRuntimeServiceFailure,
  formatRuntimeServicesUnavailable,
} from './runtime-services-errors';

export interface DoctorReport {
  status: CliStatus;
  resources: ResourceRequirement[];
  runtimeServicesIssue?: string;
}

export async function runDoctorCli(): Promise<void> {
  const status = await collectStatus();
  let resources: ResourceRequirement[] = [];
  let runtimeServicesIssue: string | undefined;
  try {
    const context = await createRuntimeServicesPortContext({ consumer: 'domain-agent' });
    const resourceStatus = await context.runtime.call<Record<string, never>, ResourcesListOutput>(
      'resources.doctor',
      {},
      { consumer: 'domain-agent', purpose: 'operator doctor check' },
    );
    if (resourceStatus.status === 'ok') {
      resources = resourceStatus.resources;
    } else {
      runtimeServicesIssue = formatRuntimeServiceFailure('Runtime Services doctor check failed', resourceStatus);
    }
  } catch (error) {
    runtimeServicesIssue = formatRuntimeServicesUnavailable(error);
  }
  if (runtimeServicesIssue) process.exitCode = 1;
  console.log(formatDoctorReport({
    status,
    resources,
    ...(runtimeServicesIssue ? { runtimeServicesIssue } : {}),
  }));
}

export function formatDoctorReport(report: DoctorReport): string {
  const requiredMissing = localRequiredResourceIds()
    .map((id) => findRuntimeResource(report.resources, id) ?? missingRuntimeResource(id))
    .filter((resource) => !resourceAvailable(resource));
  const futureStubs = futureResourceIds()
    .map((id) => findRuntimeResource(report.resources, id) ?? missingRuntimeResource(id))
    .filter((resource) => !resourceAvailable(resource));
  const botHealth = report.status.botHealth ?? [];
  const connectedBots = botHealth.filter(isConnectedHealth).length;
  const runtimeHealthReady = report.status.runningBots === 0
    || connectedBots === report.status.runningBots;
  const readiness = report.status.configComplete
    && report.status.codexAvailable
    && !report.runtimeServicesIssue
    && requiredMissing.length === 0
    && runtimeHealthReady
    ? 'ok'
    : 'attention';

  const lines = [
    'Bridge doctor',
    `readiness: ${readiness}`,
    `home: ${report.status.appDir}`,
    `config: ${report.status.configComplete ? 'complete' : 'incomplete'}`,
    `codex: ${report.status.codexAvailable ? 'available' : 'unavailable'}`,
    `agent endpoint: ${report.status.agentEndpoint}`,
    `gateway mode: ${report.status.gatewayMode}`,
    `runtime services artifact namespace: ${report.status.runtimeServices.artifactNamespace}`,
    `runtime services vector table: ${report.status.runtimeServices.vectorTableName}`,
    `runtime services record namespace: ${report.status.runtimeServices.recordNamespace}`,
    `runtime services record table: ${report.status.runtimeServices.recordTableName}`,
    `running bots: ${report.status.runningBots}`,
    `connected bots: ${connectedBots}/${report.status.runningBots}`,
  ];

  if (report.status.runningBots === 0) {
    lines.push('runtime health: not running');
  } else if (report.status.runningBots > botHealth.length) {
    lines.push('runtime health: missing');
  } else if (!runtimeHealthReady) {
    lines.push('runtime health: attention');
  } else {
    lines.push('runtime health: ok');
  }
  for (const health of botHealth) {
    const freshness = health.fresh ? 'fresh' : 'stale';
    const issue = health.issue ? ` issue=${health.issue}` : '';
    lines.push(`- ${health.processId}: ${health.state} (${freshness})${issue}`);
  }

  if (report.runtimeServicesIssue) {
    lines.push(
      'runtime services: unavailable',
      report.runtimeServicesIssue,
    );
  } else {
    lines.push('runtime services: ok');
  }

  if (report.runtimeServicesIssue) {
    lines.push('missing runtime services resources: unavailable');
  } else if (requiredMissing.length > 0) {
    lines.push(
      'missing runtime services resources:',
      ...requiredMissing.map((resource) => `- ${resource.id} [${resource.kind}] ${resource.operatorAction}`),
    );
  } else {
    lines.push('missing runtime services resources: none');
  }

  lines.push(
    `future stubs: ${futureStubs.length > 0 ? futureStubs.map((resource) => resource.id).join(', ') : 'none'}`,
  );

  return lines.join('\n');
}
