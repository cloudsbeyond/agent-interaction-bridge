import { homedir } from 'node:os';
import type { AgentAdapter } from './types';
import type { AppConfig } from '../config/schema';
import { getAppServerCwd } from '../config/schema';

export const CODEX_APP_SERVER_AGENT_ID = 'agent_runtime.codex_app_server';

export function defaultAgentTaskCwd(input: {
  agent: Pick<AgentAdapter, 'id'>;
  cfg: Pick<AppConfig, 'preferences'>;
  userHome?: string;
}): string {
  const userHome = input.userHome ?? homedir();
  return input.agent.id === CODEX_APP_SERVER_AGENT_ID
    ? getAppServerCwd(input.cfg, userHome)
    : userHome;
}
