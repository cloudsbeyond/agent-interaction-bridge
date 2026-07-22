import { paths } from '../config/paths';
import { readRuntimeHealth, type RuntimeHealthView } from './health';
import { defaultLaunchAgentLogPath, statusLaunchAgent } from './launch-agent';
import { readAndPrune, type ProcessEntry } from './registry';

export const LAUNCH_AGENT_READINESS_TIMEOUT_MS = 30_000;
export const LAUNCH_AGENT_READINESS_POLL_MS = 250;

export interface ServiceReadinessResult {
  process: ProcessEntry;
  health: RuntimeHealthView;
}

export interface ServiceReadinessOptions {
  startedAfter: number;
  timeoutMs?: number;
  pollMs?: number;
  appDir?: string;
  logPath?: string;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  status?: () => Promise<string>;
  readProcesses?: () => ProcessEntry[];
  readHealth?: (
    appDir: string,
    processId: string,
    now: number,
  ) => Promise<RuntimeHealthView | undefined>;
}

export async function waitForLaunchAgentReadiness(
  options: ServiceReadinessOptions,
): Promise<ServiceReadinessResult> {
  const timeoutMs = options.timeoutMs ?? LAUNCH_AGENT_READINESS_TIMEOUT_MS;
  const pollMs = options.pollMs ?? LAUNCH_AGENT_READINESS_POLL_MS;
  const appDir = options.appDir ?? paths.appDir;
  const logPath = options.logPath ?? defaultLaunchAgentLogPath(appDir);
  const now = options.now ?? Date.now;
  const wait = options.wait ?? sleep;
  const status = options.status ?? statusLaunchAgent;
  const readProcesses = options.readProcesses ?? readAndPrune;
  const readHealth = options.readHealth ?? readRuntimeHealth;
  const waitStartedAt = now();
  let lastObserved = 'launchd=unknown, process=missing, health=missing';

  while (true) {
    let launchdState = 'not_running';
    let processState = 'missing';
    let healthState = 'missing';
    let launchdRunning = false;
    let currentProcess: ProcessEntry | undefined;
    let currentHealth: RuntimeHealthView | undefined;

    try {
      const output = await status();
      launchdRunning = /\bstate\s*=\s*running\b/i.test(output);
      launchdState = launchdRunning ? 'running' : 'not_running';
    } catch (err) {
      launchdState = `error:${errorMessage(err)}`;
    }

    if (launchdRunning) {
      try {
        currentProcess = readProcesses()
          .filter((entry) => {
            const startedAt = Date.parse(entry.startedAt);
            return Number.isFinite(startedAt) && startedAt >= options.startedAfter;
          })
          .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];
        processState = currentProcess?.id ?? 'missing';
      } catch (err) {
        processState = `error:${errorMessage(err)}`;
      }
    }

    if (currentProcess) {
      try {
        currentHealth = await readHealth(appDir, currentProcess.id, now());
        healthState = describeHealth(currentHealth);
      } catch (err) {
        healthState = `error:${errorMessage(err)}`;
      }
    }

    lastObserved = [
      `launchd=${launchdState}`,
      `process=${processState}`,
      `health=${healthState}`,
    ].join(', ');

    if (
      launchdRunning
      && currentProcess
      && currentHealth?.fresh
      && currentHealth.state === 'connected'
      && currentHealth.endpointAvailable
    ) {
      return { process: currentProcess, health: currentHealth };
    }

    if (now() - waitStartedAt >= timeoutMs) {
      throw new Error([
        `LaunchAgent readiness timed out after ${timeoutMs}ms`,
        `last observed: ${lastObserved}`,
        `launchd log: ${logPath}`,
      ].join('\n'));
    }
    await wait(pollMs);
  }
}

function describeHealth(health: RuntimeHealthView | undefined): string {
  if (!health) return 'missing';
  if (!health.fresh) return `${health.state}:stale`;
  if (health.state === 'connected' && !health.endpointAvailable) {
    return 'connected:endpoint_unavailable';
  }
  return health.state;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
