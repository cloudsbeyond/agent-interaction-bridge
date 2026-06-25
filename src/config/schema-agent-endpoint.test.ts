import { describe, expect, test } from 'vitest';
import {
  getAgentEndpointProfileId,
  getAgentEndpointKind,
  getAppServerCwd,
  getGatewayMode,
  getMessageReplyMode,
  getReplyMentionTargets,
  getRuntimeServicesArtifactNamespace,
  getRuntimeServicesRecordNamespace,
  getRuntimeServicesRecordTableName,
  getRuntimeServicesVectorTableName,
  getTurnTraceArtifactNamespace,
  getTurnTraceEnabled,
  isAgentEndpointKind,
  isGatewayMode,
  parseAgentEndpointKind,
  type AppConfig,
} from './schema';
import { AGENT_PROFILE_CODEX_GUEST_ID, AGENT_PROFILE_CODEX_HOST_ID } from '../topology/entities';

const baseConfig: AppConfig = {
  accounts: {
    app: {
      id: 'cli_test',
      tenant: 'feishu',
      secret: 'secret',
    },
  },
};

describe('agent endpoint preference', () => {
  const userHome = ['/Users', 'tester'].join('/');

  test('defaults to exec for existing configs', () => {
    expect(getAgentEndpointKind(baseConfig)).toBe('exec');
  });

  test('accepts app-server as an explicit endpoint', () => {
    expect(
      getAgentEndpointKind({
        ...baseConfig,
        preferences: {
          agentEndpoint: 'app-server',
        },
      }),
    ).toBe('app-server');
  });

  test('defaults app-server service cwd to a dedicated operator directory', () => {
    expect(getAppServerCwd(baseConfig, userHome)).toBe(`${userHome}/Documents/Codex/app-server`);
  });

  test('accepts an operator-configured app-server service cwd', () => {
    expect(
      getAppServerCwd({
        ...baseConfig,
        preferences: {
          appServerCwd: '~/Codex/app-server-dev',
        },
      }, userHome),
    ).toBe(`${userHome}/Codex/app-server-dev`);
    expect(
      getAppServerCwd({
        ...baseConfig,
        preferences: {
          appServerCwd: '/srv/codex-app-server',
        },
      }, userHome),
    ).toBe('/srv/codex-app-server');
  });

  test('falls back to the default app-server cwd for blank config values', () => {
    expect(
      getAppServerCwd({
        ...baseConfig,
        preferences: {
          appServerCwd: '   ',
        },
      }, userHome),
    ).toBe(`${userHome}/Documents/Codex/app-server`);
  });

  test('parses only known CLI endpoint values', () => {
    expect(parseAgentEndpointKind(undefined)).toBeUndefined();
    expect(parseAgentEndpointKind('exec')).toBe('exec');
    expect(parseAgentEndpointKind('app-server')).toBe('app-server');
    expect(() => parseAgentEndpointKind('stdio')).toThrow('invalid agent endpoint: stdio');
  });

  test('exposes an endpoint type guard', () => {
    expect(isAgentEndpointKind('exec')).toBe(true);
    expect(isAgentEndpointKind('app-server')).toBe(true);
    expect(isAgentEndpointKind('stdio')).toBe(false);
  });

  test('defaults to the host profile and accepts the guest profile', () => {
    expect(getAgentEndpointProfileId(baseConfig)).toBe(AGENT_PROFILE_CODEX_HOST_ID);
    expect(
      getAgentEndpointProfileId({
        ...baseConfig,
        preferences: { agentProfile: AGENT_PROFILE_CODEX_GUEST_ID },
      }),
    ).toBe(AGENT_PROFILE_CODEX_GUEST_ID);
  });

  test('ignores unknown profile values from config files', () => {
    expect(
      getAgentEndpointProfileId({
        ...baseConfig,
        preferences: { agentProfile: 'agent_profile.unknown' },
      }),
    ).toBe(AGENT_PROFILE_CODEX_HOST_ID);
  });

  test('defaults to gateway adapter mode for existing configs', () => {
    expect(getGatewayMode(baseConfig)).toBe('adapter');
  });

  test('defaults Feishu/Lark replies to final text delivery for readability', () => {
    expect(getMessageReplyMode(baseConfig)).toBe('text');
  });

  test('resolves configured reply mention targets and drops invalid entries', () => {
    expect(getReplyMentionTargets(baseConfig)).toEqual([]);
    expect(
      getReplyMentionTargets({
        ...baseConfig,
        preferences: {
          replyMentionTargets: [
            { name: 'Example Bot', id: 'cli_example_bot' },
            { name: 'Example Operator', id: 'ou_operator', key: '@operator' },
            { name: '', id: 'cli_empty_name' },
            { name: 'NoId', id: '' },
          ],
        },
      }),
    ).toEqual([
      { name: 'Example Bot', id: 'cli_example_bot', key: '@Example Bot' },
      { name: 'Example Operator', id: 'ou_operator', key: '@operator' },
    ]);
  });

  test('accepts channel relay as an explicit gateway mode', () => {
    expect(
      getGatewayMode({
        ...baseConfig,
        preferences: { gatewayMode: 'relay' },
      }),
    ).toBe('relay');
    expect(isGatewayMode('relay')).toBe(true);
    expect(isGatewayMode('adapter')).toBe(true);
    expect(isGatewayMode('transparent_proxy')).toBe(false);
    expect(isGatewayMode('human_agent_adapter')).toBe(false);
  });

  test('does not keep legacy gateway mode values compatible', () => {
    expect(
      getGatewayMode({
        ...baseConfig,
        preferences: { gatewayMode: 'transparent_proxy' } as unknown as AppConfig['preferences'],
      }),
    ).toBe('adapter');
    expect(
      getGatewayMode({
        ...baseConfig,
        preferences: { gatewayMode: 'human_agent_adapter' } as unknown as AppConfig['preferences'],
      }),
    ).toBe('adapter');
    expect(
      getGatewayMode({
        ...baseConfig,
        preferences: { interactionMode: 'relay' } as unknown as AppConfig['preferences'],
      }),
    ).toBe('adapter');
  });

  test('falls back to gateway adapter for unknown gateway mode values', () => {
    expect(
      getGatewayMode({
        ...baseConfig,
        preferences: { gatewayMode: 'pass_through' } as unknown as AppConfig['preferences'],
      }),
    ).toBe('adapter');
    expect(isGatewayMode('pass_through')).toBe(false);
  });

  test('exposes explicit Runtime Services resource-scoped names for downstream storage calls', () => {
    expect(getRuntimeServicesArtifactNamespace(baseConfig)).toBe('agent-interaction-bridge');
    expect(getRuntimeServicesRecordNamespace(baseConfig)).toBe('agent-interaction-bridge');
    expect(getRuntimeServicesVectorTableName(baseConfig)).toBe('agent_interaction_bridge_vectors');
    expect(getRuntimeServicesRecordTableName(baseConfig)).toBe('agent_interaction_bridge_records');

    const configured: AppConfig = {
      ...baseConfig,
      runtimeServices: {
        artifact_namespace: 'tenant-alpha-artifacts',
        vector_tableName: 'tenant_alpha_vectors',
        record_namespace: 'tenant-alpha-records',
        record_tableName: 'tenant_alpha_records',
      },
    };

    expect(getRuntimeServicesArtifactNamespace(configured)).toBe('tenant-alpha-artifacts');
    expect(getRuntimeServicesRecordNamespace(configured)).toBe('tenant-alpha-records');
    expect(getRuntimeServicesVectorTableName(configured)).toBe('tenant_alpha_vectors');
    expect(getRuntimeServicesRecordTableName(configured)).toBe('tenant_alpha_records');
  });

  test('falls back to bridge-owned Runtime Services names when config values are invalid', () => {
    const configured: AppConfig = {
      ...baseConfig,
      runtimeServices: {
        artifact_namespace: '../bad',
        vector_tableName: 'bad table',
        record_namespace: '',
        record_tableName: '',
      },
    };

    expect(getRuntimeServicesArtifactNamespace(configured)).toBe('agent-interaction-bridge');
    expect(getRuntimeServicesRecordNamespace(configured)).toBe('agent-interaction-bridge');
    expect(getRuntimeServicesVectorTableName(configured)).toBe('agent_interaction_bridge_vectors');
    expect(getRuntimeServicesRecordTableName(configured)).toBe('agent_interaction_bridge_records');
  });

  test('keeps turn trace recording disabled by default and configurable per operator', () => {
    expect(getTurnTraceEnabled(baseConfig)).toBe(false);
    expect(getTurnTraceArtifactNamespace(baseConfig)).toBe('agent-interaction-bridge.turn-traces');

    const configured: AppConfig = {
      ...baseConfig,
      preferences: {
        turnTrace: {
          enabled: true,
          artifactNamespace: 'tenant-alpha-turn-traces',
        },
      },
    };

    expect(getTurnTraceEnabled(configured)).toBe(true);
    expect(getTurnTraceArtifactNamespace(configured)).toBe('tenant-alpha-turn-traces');
  });
});
