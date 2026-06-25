import { CLI_CHANNEL, FEISHU_CHANNEL, MAC_CHANNEL, WEB_CHANNEL } from '../signal/router';

export type BridgeEntityRole =
  | 'agent_runtime'
  | 'interaction_channel'
  | 'delivery_support'
  | 'artifact_store';

export interface BridgeEntity {
  id: string;
  role: BridgeEntityRole;
  provider: string;
  displayName: string;
  description: string;
  capabilityRef?: string;
}

export type EndpointAuthority = 'owner' | 'delegated';
export type EndpointCapabilityLevel = 'operator_configured' | 'profile_restricted' | 'blocked';
export const AGENT_PROFILE_CODEX_HOST_ID = 'agent_profile.codex_host';
export const AGENT_PROFILE_CODEX_GUEST_ID = 'agent_profile.codex_guest';
export type AgentEndpointProfileId =
  | typeof AGENT_PROFILE_CODEX_HOST_ID
  | typeof AGENT_PROFILE_CODEX_GUEST_ID;

export interface AgentEndpointCapabilityProfile {
  id: string;
  endpointRef: string;
  displayName: string;
  authority: EndpointAuthority;
  codexHome: 'operator_default' | 'profile_isolated';
  workspaceBinding: 'scope_default' | 'profile_default';
  capabilities: {
    filesystem: EndpointCapabilityLevel;
    shell: EndpointCapabilityLevel;
    network: EndpointCapabilityLevel;
    publishing: EndpointCapabilityLevel;
  };
  hitlRequiredFor: string[];
}

export const AGENT_RUNTIME_CODEX_CLI: BridgeEntity = {
  id: 'agent_runtime.codex_cli',
  role: 'agent_runtime',
  provider: 'codex',
  displayName: 'Codex CLI',
  description: 'Local agent runtime that owns reasoning, tool use, and task execution.',
  capabilityRef: 'agent.codex_cli',
};

export const AGENT_PROFILE_CODEX_HOST: AgentEndpointCapabilityProfile = {
  id: AGENT_PROFILE_CODEX_HOST_ID,
  endpointRef: AGENT_RUNTIME_CODEX_CLI.id,
  displayName: 'Codex host profile',
  authority: 'owner',
  codexHome: 'operator_default',
  workspaceBinding: 'scope_default',
  capabilities: {
    filesystem: 'operator_configured',
    shell: 'operator_configured',
    network: 'operator_configured',
    publishing: 'profile_restricted',
  },
  hitlRequiredFor: ['credential changes', 'publishing', 'remote exposure'],
};

export const AGENT_PROFILE_CODEX_GUEST: AgentEndpointCapabilityProfile = {
  id: AGENT_PROFILE_CODEX_GUEST_ID,
  endpointRef: AGENT_RUNTIME_CODEX_CLI.id,
  displayName: 'Codex guest profile',
  authority: 'delegated',
  codexHome: 'profile_isolated',
  workspaceBinding: 'profile_default',
  capabilities: {
    filesystem: 'profile_restricted',
    shell: 'profile_restricted',
    network: 'profile_restricted',
    publishing: 'blocked',
  },
  hitlRequiredFor: ['filesystem expansion', 'shell escalation', 'network access'],
};

export const CHANNEL_FEISHU: BridgeEntity = {
  id: 'interaction_channel.feishu',
  role: 'interaction_channel',
  provider: FEISHU_CHANNEL,
  displayName: 'Feishu / Lark',
  description: 'Primary chat and card channel for remote human interaction.',
  capabilityRef: FEISHU_CHANNEL,
};

export const CHANNEL_MAC: BridgeEntity = {
  id: 'interaction_channel.mac',
  role: 'interaction_channel',
  provider: MAC_CHANNEL,
  displayName: 'Mac',
  description: 'Local desktop channel for urgent human attention signals.',
  capabilityRef: MAC_CHANNEL,
};

export const CHANNEL_WEB: BridgeEntity = {
  id: 'interaction_channel.web',
  role: 'interaction_channel',
  provider: WEB_CHANNEL,
  displayName: 'Web',
  description: 'Local browser channel for rich timelines and artifact previews.',
  capabilityRef: WEB_CHANNEL,
};

export const CHANNEL_CLI: BridgeEntity = {
  id: 'interaction_channel.cli',
  role: 'interaction_channel',
  provider: CLI_CHANNEL,
  displayName: 'CLI',
  description: 'Developer/debug channel for local terminal output.',
  capabilityRef: CLI_CHANNEL,
};

const ENTITIES: BridgeEntity[] = [
  AGENT_RUNTIME_CODEX_CLI,
  CHANNEL_FEISHU,
  CHANNEL_MAC,
  CHANNEL_WEB,
  CHANNEL_CLI,
];

const ENDPOINT_PROFILES: AgentEndpointCapabilityProfile[] = [
  AGENT_PROFILE_CODEX_HOST,
  AGENT_PROFILE_CODEX_GUEST,
];

export function listBridgeEntities(): BridgeEntity[] {
  return ENTITIES.map(cloneEntity);
}

export function listBridgeEntitiesByRole(role: BridgeEntityRole): BridgeEntity[] {
  return ENTITIES.filter((entity) => entity.role === role).map(cloneEntity);
}

export function getBridgeEntity(id: string): BridgeEntity | undefined {
  const entity = ENTITIES.find((candidate) => candidate.id === id);
  return entity ? cloneEntity(entity) : undefined;
}

export function listAgentEndpointProfiles(): AgentEndpointCapabilityProfile[] {
  return ENDPOINT_PROFILES.map(cloneAgentEndpointProfile);
}

export function getAgentEndpointProfile(
  id: string,
): AgentEndpointCapabilityProfile | undefined {
  const profile = ENDPOINT_PROFILES.find((candidate) => candidate.id === id);
  return profile ? cloneAgentEndpointProfile(profile) : undefined;
}

export function isAgentEndpointProfileId(value: unknown): value is AgentEndpointProfileId {
  return value === AGENT_PROFILE_CODEX_HOST_ID || value === AGENT_PROFILE_CODEX_GUEST_ID;
}

function cloneEntity(entity: BridgeEntity): BridgeEntity {
  return { ...entity };
}

function cloneAgentEndpointProfile(
  profile: AgentEndpointCapabilityProfile,
): AgentEndpointCapabilityProfile {
  return {
    ...profile,
    capabilities: { ...profile.capabilities },
    hitlRequiredFor: [...profile.hitlRequiredFor],
  };
}
