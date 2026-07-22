import { parseAgentEndpointKind } from '../../config/schema';
import {
  installLaunchAgent,
  launchAgentPath,
  restartLaunchAgent,
  startLaunchAgent,
  statusLaunchAgent,
  stopLaunchAgent,
  uninstallLaunchAgent,
} from '../../runtime/launch-agent';
import { waitForLaunchAgentReadiness } from '../../runtime/service-readiness';

export interface ServiceCommandOptions {
  config?: string;
  agentEndpoint?: string;
}

interface ServiceCommandDeps {
  installLaunchAgent: typeof installLaunchAgent;
  uninstallLaunchAgent: typeof uninstallLaunchAgent;
  startLaunchAgent: typeof startLaunchAgent;
  stopLaunchAgent: typeof stopLaunchAgent;
  restartLaunchAgent: typeof restartLaunchAgent;
  statusLaunchAgent: typeof statusLaunchAgent;
  waitForReadiness: typeof waitForLaunchAgentReadiness;
  now: () => number;
}

const defaultDeps: ServiceCommandDeps = {
  installLaunchAgent,
  uninstallLaunchAgent,
  startLaunchAgent,
  stopLaunchAgent,
  restartLaunchAgent,
  statusLaunchAgent,
  waitForReadiness: waitForLaunchAgentReadiness,
  now: Date.now,
};

export async function runServiceCommand(
  action: string,
  type: string,
  options: ServiceCommandOptions = {},
  overrides: Partial<ServiceCommandDeps> = {},
): Promise<void> {
  if (type !== 'launchd') {
    throw new Error(`unsupported service type: ${type}`);
  }
  const launchOptions = {
    ...(options.config ? { configPath: options.config } : {}),
    agentEndpoint: parseAgentEndpointKind(options.agentEndpoint),
  };
  const deps = { ...defaultDeps, ...overrides };

  switch (action) {
    case 'install': {
      const path = await deps.installLaunchAgent(launchOptions);
      console.log(`Installed LaunchAgent: ${path}`);
      return;
    }
    case 'uninstall':
      await deps.uninstallLaunchAgent(launchOptions);
      console.log(`Uninstalled LaunchAgent: ${launchAgentPath()}`);
      return;
    case 'start': {
      const startedAfter = deps.now();
      await deps.startLaunchAgent(launchOptions);
      await deps.waitForReadiness({ startedAfter });
      console.log('Started LaunchAgent');
      return;
    }
    case 'stop':
      await deps.stopLaunchAgent(launchOptions);
      console.log('Stopped LaunchAgent');
      return;
    case 'restart': {
      const startedAfter = deps.now();
      await deps.restartLaunchAgent(launchOptions);
      await deps.waitForReadiness({ startedAfter });
      console.log('Restarted LaunchAgent');
      return;
    }
    case 'status':
      console.log(await deps.statusLaunchAgent());
      return;
    default:
      throw new Error(`unsupported service action: ${action}`);
  }
}
