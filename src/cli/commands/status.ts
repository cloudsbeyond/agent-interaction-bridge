import { createAgentAdapter } from '../../agent/factory';
import { paths } from '../../config/paths';
import {
  getAgentEndpointKind,
  getGatewayMode,
  getRuntimeServicesArtifactNamespace,
  getRuntimeServicesRecordNamespace,
  getRuntimeServicesRecordTableName,
  getRuntimeServicesVectorTableName,
  isComplete,
  type AgentEndpointKind,
  type AppConfig,
  type GatewayMode,
} from '../../config/schema';
import { loadConfig } from '../../config/store';
import { readAndPrune } from '../../runtime/registry';
import { readRuntimeHealth, type RuntimeHealthView } from '../../runtime/health';

interface ProcessLike {
  id: string;
  pid?: number;
  agentEndpoint?: AgentEndpointKind;
}

export interface BotRuntimeHealth {
  processId: string;
  state: RuntimeHealthView['state'];
  updatedAt: string;
  fresh: boolean;
  endpointAvailable: boolean;
  issue?: string;
}

export interface CliStatus {
  appDir: string;
  configPath: string;
  configComplete: boolean;
  app?: {
    id: string;
    tenant: string;
  };
  runningBots: number;
  botHealth: BotRuntimeHealth[];
  agentEndpoint: AgentEndpointKind;
  gatewayMode: GatewayMode;
  runtimeServices: {
    artifactNamespace: string;
    vectorTableName: string;
    recordNamespace: string;
    recordTableName: string;
  };
  runningAgentEndpoints: AgentEndpointKind[];
  codexAvailable: boolean;
}

export interface CollectStatusDeps {
  appDir: string;
  configPath: string;
  loadConfig: () => Promise<Partial<AppConfig>>;
  readProcesses: () => ProcessLike[];
  isCodexAvailable: () => Promise<boolean>;
  readHealth: (processId: string) => Promise<RuntimeHealthView | undefined>;
}

export async function runStatusCli(): Promise<void> {
  console.log(formatStatus(await collectStatus()));
}

export async function collectStatus(
  deps: Partial<CollectStatusDeps> = {},
): Promise<CliStatus> {
  const load = deps.loadConfig ?? (() => loadConfig(deps.configPath ?? paths.configFile));
  const config = await load();
  const configComplete = isComplete(config);
  const app = config.accounts?.app;
  const agentEndpoint = configComplete ? getAgentEndpointKind(config) : 'exec';
  const gatewayMode = getGatewayMode(config);
  const adapter = createAgentAdapter(agentEndpoint);
  const processes = (deps.readProcesses ?? readAndPrune)();
  const healthReader = deps.readHealth
    ?? ((processId: string) => readRuntimeHealth(deps.appDir ?? paths.appDir, processId));
  const botHealth = (
    await Promise.all(
      processes.map(async (process) => {
        const health = await healthReader(process.id);
        if (!health) return undefined;
        return {
          processId: process.id,
          state: health.state,
          updatedAt: health.updatedAt,
          fresh: health.fresh,
          endpointAvailable: health.endpointAvailable,
          ...(health.issue ? { issue: health.issue } : {}),
        } satisfies BotRuntimeHealth;
      }),
    )
  ).filter((health): health is BotRuntimeHealth => health !== undefined);
  const runningAgentEndpoints = [
    ...new Set(
      processes
        .map((process) => process.agentEndpoint)
        .filter((value): value is AgentEndpointKind => value === 'exec' || value === 'app-server'),
    ),
  ];

  return {
    appDir: deps.appDir ?? paths.appDir,
    configPath: deps.configPath ?? paths.configFile,
    configComplete,
    ...(app?.id && app.tenant
      ? {
          app: {
            id: app.id,
            tenant: app.tenant,
          },
        }
      : {}),
    runningBots: processes.length,
    botHealth,
    agentEndpoint,
    gatewayMode,
    runtimeServices: {
      artifactNamespace: getRuntimeServicesArtifactNamespace(config),
      vectorTableName: getRuntimeServicesVectorTableName(config),
      recordNamespace: getRuntimeServicesRecordNamespace(config),
      recordTableName: getRuntimeServicesRecordTableName(config),
    },
    runningAgentEndpoints,
    codexAvailable: await (deps.isCodexAvailable ?? (() => adapter.isAvailable()))(),
  };
}

export function formatStatus(status: CliStatus): string {
  const connectedBots = status.botHealth.filter(isConnectedHealth).length;
  const lines = [
    '# Agent-Interaction-Bridge status',
    `home: ${status.appDir}`,
    `config: ${status.configComplete ? 'complete' : 'incomplete'}`,
    `config path: ${status.configPath}`,
  ];

  if (status.app) {
    lines.push(`app: ${status.app.tenant} ${maskAppId(status.app.id)}`);
  }

  lines.push(
    `running bots: ${status.runningBots}`,
    `connected bots: ${connectedBots}/${status.runningBots}`,
    `configured endpoint: ${status.agentEndpoint}`,
    `gateway mode: ${status.gatewayMode}`,
    `runtime services artifact namespace: ${status.runtimeServices.artifactNamespace}`,
    `runtime services vector table: ${status.runtimeServices.vectorTableName}`,
    `runtime services record namespace: ${status.runtimeServices.recordNamespace}`,
    `runtime services record table: ${status.runtimeServices.recordTableName}`,
    `running endpoints: ${status.runningAgentEndpoints.length > 0 ? status.runningAgentEndpoints.join(', ') : 'none'}`,
    `codex: ${status.codexAvailable ? 'available' : 'unavailable'}`,
  );

  return lines.join('\n');
}

export function isConnectedHealth(health: BotRuntimeHealth): boolean {
  return health.fresh && health.state === 'connected' && health.endpointAvailable;
}

export function maskAppId(appId: string): string {
  if (appId.length <= 8) return appId;
  return `${appId.slice(0, 4)}…${appId.slice(-4)}`;
}
