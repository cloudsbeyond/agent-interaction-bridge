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

export interface ServiceCommandOptions {
  config?: string;
  agentEndpoint?: string;
}

export async function runServiceCommand(
  action: string,
  type: string,
  options: ServiceCommandOptions = {},
): Promise<void> {
  if (type !== 'launchd') {
    throw new Error(`unsupported service type: ${type}`);
  }
  const launchOptions = {
    ...(options.config ? { configPath: options.config } : {}),
    agentEndpoint: parseAgentEndpointKind(options.agentEndpoint),
  };

  switch (action) {
    case 'install': {
      const path = await installLaunchAgent(launchOptions);
      console.log(`Installed LaunchAgent: ${path}`);
      return;
    }
    case 'uninstall':
      await uninstallLaunchAgent(launchOptions);
      console.log(`Uninstalled LaunchAgent: ${launchAgentPath()}`);
      return;
    case 'start':
      await startLaunchAgent(launchOptions);
      console.log('Started LaunchAgent');
      return;
    case 'stop':
      await stopLaunchAgent(launchOptions);
      console.log('Stopped LaunchAgent');
      return;
    case 'restart':
      await restartLaunchAgent(launchOptions);
      console.log('Restarted LaunchAgent');
      return;
    case 'status':
      console.log(await statusLaunchAgent());
      return;
    default:
      throw new Error(`unsupported service action: ${action}`);
  }
}
