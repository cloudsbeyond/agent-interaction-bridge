import { describe, expect, test } from 'vitest';
import {
  AGENT_PROFILE_CODEX_GUEST,
  AGENT_PROFILE_CODEX_HOST,
  AGENT_RUNTIME_CODEX_CLI,
  CHANNEL_FEISHU,
  CHANNEL_MAC,
  getAgentEndpointProfile,
  getBridgeEntity,
  listAgentEndpointProfiles,
  listBridgeEntities,
  listBridgeEntitiesByRole,
} from './entities';

describe('bridge entity topology', () => {
  test('models Codex CLI as one concrete agent runtime entity', () => {
    expect(AGENT_RUNTIME_CODEX_CLI).toMatchObject({
      id: 'agent_runtime.codex_cli',
      role: 'agent_runtime',
      provider: 'codex',
      displayName: 'Codex CLI',
    });
  });

  test('models Feishu and Mac as concrete interaction channel entities', () => {
    expect(CHANNEL_FEISHU).toMatchObject({
      id: 'interaction_channel.feishu',
      role: 'interaction_channel',
      provider: 'feishu',
    });
    expect(CHANNEL_MAC).toMatchObject({
      id: 'interaction_channel.mac',
      role: 'interaction_channel',
      provider: 'mac',
    });
  });

  test('can query entities by role without assuming Feishu or Codex are special', () => {
    expect(listBridgeEntitiesByRole('agent_runtime').map((entity) => entity.id)).toEqual([
      'agent_runtime.codex_cli',
    ]);
    expect(listBridgeEntitiesByRole('interaction_channel').map((entity) => entity.id)).toContain(
      'interaction_channel.feishu',
    );
  });

  test('models host and guest endpoint profiles as capability boundaries', () => {
    expect(AGENT_PROFILE_CODEX_HOST).toMatchObject({
      id: 'agent_profile.codex_host',
      endpointRef: AGENT_RUNTIME_CODEX_CLI.id,
      authority: 'owner',
      codexHome: 'operator_default',
    });
    expect(AGENT_PROFILE_CODEX_GUEST).toMatchObject({
      id: 'agent_profile.codex_guest',
      endpointRef: AGENT_RUNTIME_CODEX_CLI.id,
      authority: 'delegated',
      codexHome: 'profile_isolated',
      capabilities: {
        publishing: 'blocked',
      },
    });
  });

  test('returns immutable endpoint profile snapshots', () => {
    const all = listAgentEndpointProfiles();
    all[0]!.capabilities.publishing = 'blocked';
    all[0]!.hitlRequiredFor.push('mutated');

    expect(getAgentEndpointProfile('agent_profile.codex_host')?.capabilities.publishing).toBe(
      'profile_restricted',
    );
    expect(getAgentEndpointProfile('agent_profile.codex_host')?.hitlRequiredFor).not.toContain(
      'mutated',
    );
  });

  test('returns immutable entity snapshots', () => {
    const all = listBridgeEntities();
    all[0]!.displayName = 'mutated';

    expect(getBridgeEntity('agent_runtime.codex_cli')?.displayName).toBe('Codex CLI');
  });
});
