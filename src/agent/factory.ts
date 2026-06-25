import type { AgentEndpointKind } from '../config/schema';
import type { AgentAdapter } from './types';
import { CodexAdapter } from './codex/adapter';
import { CodexAppServerAdapter } from './codex/app-server-adapter';

export interface AgentAdapterFactoryOptions {
  appServerCwd?: string;
}

export function createAgentAdapter(
  kind: AgentEndpointKind,
  options: AgentAdapterFactoryOptions = {},
): AgentAdapter {
  if (kind === 'app-server') return new CodexAppServerAdapter({ appServerCwd: options.appServerCwd });
  return new CodexAdapter();
}
