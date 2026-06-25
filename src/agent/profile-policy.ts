import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getAgentEndpointProfileId, type AppConfig } from '../config/schema';
import {
  AGENT_PROFILE_CODEX_GUEST_ID,
  AGENT_PROFILE_CODEX_HOST_ID,
  getAgentEndpointProfile,
  isAgentEndpointProfileId,
  type AgentEndpointCapabilityProfile,
  type AgentEndpointProfileId,
} from '../topology/entities';
import type { AgentRunOptions } from './types';

export interface AgentProfileRunPlan {
  profile: AgentEndpointCapabilityProfile;
  agentRuntimeId: string;
  run: AgentRunOptions;
  directoriesToCreate: string[];
  notes: string[];
}

export interface AgentProfileRunPlanInput {
  profileId?: string;
  runtimeHome: string;
  scope: string;
  agentRuntimeId?: string;
  run: AgentRunOptions;
}

export function getDefaultAgentEndpointProfileId(
  cfg: Pick<AppConfig, 'preferences'>,
): AgentEndpointProfileId {
  return getAgentEndpointProfileId(cfg);
}

export function buildAgentProfileRunPlan(input: AgentProfileRunPlanInput): AgentProfileRunPlan {
  const profileId = isAgentEndpointProfileId(input.profileId)
    ? input.profileId
    : AGENT_PROFILE_CODEX_HOST_ID;
  const profile = getRequiredProfile(profileId);
  if (profile.id === AGENT_PROFILE_CODEX_GUEST_ID) {
    return buildGuestRunPlan(input, profile);
  }
  return buildHostRunPlan(input, profile);
}

export async function prepareAgentProfileRunPlan(
  input: AgentProfileRunPlanInput,
): Promise<AgentProfileRunPlan> {
  const plan = buildAgentProfileRunPlan(input);
  await Promise.all(plan.directoriesToCreate.map((dir) => mkdir(dir, { recursive: true })));
  return plan;
}

function buildHostRunPlan(
  input: AgentProfileRunPlanInput,
  profile: AgentEndpointCapabilityProfile,
): AgentProfileRunPlan {
  return {
    profile,
    agentRuntimeId: runtimeId(input.agentRuntimeId, profile.id),
    run: {
      ...input.run,
      endpointProfileId: profile.id,
      permissionMode: input.run.permissionMode ?? 'bypassPermissions',
      sandboxMode: input.run.sandboxMode ?? 'danger-full-access',
      approvalPolicy: input.run.approvalPolicy ?? 'never',
    },
    directoriesToCreate: [],
    notes: [],
  };
}

function buildGuestRunPlan(
  input: AgentProfileRunPlanInput,
  profile: AgentEndpointCapabilityProfile,
): AgentProfileRunPlan {
  const profileRoot = join(input.runtimeHome, 'profiles', 'codex-guest');
  const codexHome = join(profileRoot, 'codex-home');
  const workspace = join(profileRoot, 'workspaces', safeScope(input.scope));
  const originalCwd = input.run.cwd;
  const cwdChanged = originalCwd !== undefined && originalCwd !== workspace;
  const notes: string[] = [];
  if (cwdChanged) notes.push(`cwd rewritten from ${originalCwd} to profile workspace`);
  if (cwdChanged && input.run.sessionId) {
    notes.push('session cleared because guest profile uses isolated workspace state');
  }

  return {
    profile,
    agentRuntimeId: runtimeId(input.agentRuntimeId, profile.id),
    run: {
      ...input.run,
      endpointProfileId: profile.id,
      cwd: workspace,
      codexHome,
      sessionId: cwdChanged ? undefined : input.run.sessionId,
      permissionMode: 'default',
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
    },
    directoriesToCreate: [codexHome, workspace],
    notes,
  };
}

function getRequiredProfile(id: AgentEndpointProfileId): AgentEndpointCapabilityProfile {
  const profile = getAgentEndpointProfile(id);
  if (!profile) throw new Error(`unknown agent endpoint profile: ${id}`);
  return profile;
}

function runtimeId(agentRuntimeId: string | undefined, profileId: string): string {
  return `${agentRuntimeId ?? 'agent_runtime.codex'}:${profileId}`;
}

function safeScope(scope: string): string {
  const value = scope.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return value || 'default';
}
